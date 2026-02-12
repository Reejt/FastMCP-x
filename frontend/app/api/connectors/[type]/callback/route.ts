import { NextRequest, NextResponse } from 'next/server';

const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'http://localhost:3001';

// Token exchange configuration per provider
const TOKEN_CONFIG: Record<string, {
  token_url: string;
  client_id_env: string;
  client_secret_env: string;
}> = {
  gdrive: {
    token_url: 'https://oauth2.googleapis.com/token',
    client_id_env: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    client_secret_env: 'GOOGLE_CLIENT_SECRET',
  },
  gmail: {
    token_url: 'https://oauth2.googleapis.com/token',
    client_id_env: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    client_secret_env: 'GOOGLE_CLIENT_SECRET',
  },
  slack: {
    token_url: 'https://slack.com/api/oauth.v2.access',
    client_id_env: 'NEXT_PUBLIC_SLACK_CLIENT_ID',
    client_secret_env: 'SLACK_CLIENT_SECRET',
  },
  onedrive: {
    token_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    client_id_env: 'NEXT_PUBLIC_MICROSOFT_CLIENT_ID',
    client_secret_env: 'MICROSOFT_CLIENT_SECRET',
  },
};

/**
 * GET /api/connectors/[type]/callback
 * Handles OAuth callback from provider, exchanges code for tokens,
 * stores encrypted tokens via bridge server, and redirects to app.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get('code');
  const stateParam = searchParams.get('state');
  const error = searchParams.get('error');

  // Handle OAuth error
  if (error) {
    const errorDescription = searchParams.get('error_description') || error;
    console.error(`OAuth error for ${type}:`, errorDescription);
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed</title>
  <script>
    window.opener?.postMessage({ type: 'connector_authenticated', connector_type: '${type}', success: false, error: '${errorDescription}' }, '*');
    window.close();
  </script>
</head>
<body>
  <p>Connection failed: ${errorDescription}</p>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  if (!code || !stateParam) {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed</title>
  <script>
    window.opener?.postMessage({ type: 'connector_authenticated', connector_type: '${type}', success: false, error: 'Missing authorization code' }, '*');
    window.close();
  </script>
</head>
<body>
  <p>Connection failed: Missing authorization code</p>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  const config = TOKEN_CONFIG[type];
  if (!config) {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed</title>
  <script>
    window.opener?.postMessage({ type: 'connector_authenticated', connector_type: '${type}', success: false, error: 'Unknown connector type' }, '*');
    window.close();
  </script>
</head>
<body>
  <p>Connection failed: Unknown connector type</p>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }

  try {
    // Decode and validate state
    const stateJson = Buffer.from(stateParam, 'base64').toString('utf-8');
    const state = JSON.parse(stateJson);
    const { user_id, connector_type, csrf_token } = state;

    // Validate CSRF token
    const storedCsrf = request.cookies.get('connector_csrf')?.value;
    if (!storedCsrf || storedCsrf !== csrf_token) {
      console.error('CSRF token mismatch');
      return NextResponse.redirect(
        new URL(`/dashboard?connector_error=${type}&reason=csrf_mismatch`, request.url)
      );
    }

    // Exchange code for tokens
    const clientId = process.env[config.client_id_env];
    const clientSecret = process.env[config.client_secret_env];

    if (!clientId || !clientSecret) {
      throw new Error(`OAuth credentials not configured for ${type}`);
    }

    const origin = request.nextUrl.origin;
    const redirectUri = `${origin}/api/connectors/${type}/callback`;

    let tokenData: Record<string, unknown>;

    if (type === 'slack') {
      // Slack uses a different token exchange format
      const tokenResp = await fetch(config.token_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });
      tokenData = await tokenResp.json();

      if (!(tokenData as Record<string, boolean>).ok) {
        throw new Error(`Slack token exchange failed: ${(tokenData as Record<string, string>).error}`);
      }
    } else {
      // Standard OAuth2 token exchange (Google, Microsoft)
      const tokenResp = await fetch(config.token_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });
      tokenData = await tokenResp.json();

      if ((tokenData as Record<string, string>).error) {
        throw new Error(`Token exchange failed: ${(tokenData as Record<string, string>).error_description || (tokenData as Record<string, string>).error}`);
      }
    }

    // Extract tokens based on provider
    let accessToken: string;
    let refreshToken: string | undefined;
    let expiresIn: number | undefined;
    let scopes: string[] | undefined;
    let metadata: Record<string, unknown> = {};

    if (type === 'slack') {
      // Slack returns two tokens:
      // 1. tokenData.access_token - bot/app token (xoxb-*) (has search:read.public, channels:history, etc.)
      // 2. tokenData.authed_user.access_token - user token (xoxp-*) 
      // We MUST use the bot token for search.messages API
      const botToken = (tokenData as Record<string, string>).access_token;
      const authedUser = (tokenData as Record<string, Record<string, string>>).authed_user || {};
      const userToken = authedUser.access_token;
      
      // Debug logging
      console.log(`🔐 Slack token exchange:
        Bot token: ${botToken ? botToken.substring(0, 10) + '...' : 'MISSING'}
        User token: ${userToken ? userToken.substring(0, 10) + '...' : 'MISSING'}
        Using: ${botToken ? 'BOT' : 'USER'}`);
      
      // Use bot token ONLY - it's required for search.messages API
      if (!botToken) {
        throw new Error('Bot token missing from Slack OAuth response. Check your app permissions.');
      }
      accessToken = botToken;
      
      // Get scopes from bot token
      const botScopes = (tokenData as Record<string, string>).scope;
      scopes = botScopes?.split(',').map(s => s.trim());
      
      metadata = {
        team_id: (tokenData as Record<string, Record<string, string>>).team?.id,
        team_name: (tokenData as Record<string, Record<string, string>>).team?.name,
        bot_user_id: (tokenData as Record<string, string>).bot_user_id,
        app_id: (tokenData as Record<string, string>).app_id,
        user_token: userToken, // Store user token separately if needed
      };
    } else {
      accessToken = tokenData.access_token as string;
      refreshToken = tokenData.refresh_token as string | undefined;
      expiresIn = tokenData.expires_in as number | undefined;
      scopes = (tokenData.scope as string)?.split(' ');
    }

    if (!accessToken) {
      throw new Error('No access token received from provider');
    }

    // Calculate token expiry
    let tokenExpiresAt: string | undefined;
    if (expiresIn) {
      tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();
    }

    // Store tokens via bridge server (which handles encryption)
    const storeResp = await fetch(`${BRIDGE_SERVER_URL}/api/connectors/store-tokens`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id,
        connector_type,
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: tokenExpiresAt,
        scopes,
        metadata,
      }),
    });

    if (!storeResp.ok) {
      const storeError = await storeResp.text();
      throw new Error(`Failed to store tokens: ${storeError}`);
    }

    // Return success page that closes the popup
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>Connection Successful</title>
  <script>
    window.opener?.postMessage({ type: 'connector_authenticated', connector_type: '${type}', success: true }, '*');
    window.close();
  </script>
</head>
<body>
  <p>Connection successful. This window will close automatically.</p>
</body>
</html>`,
      {
        headers: { 'Content-Type': 'text/html' },
        status: 200,
      }
    );
  } catch (err) {
    console.error(`OAuth callback error for ${type}:`, err);
    const reason = err instanceof Error ? err.message : 'unknown_error';
    return new NextResponse(
      `<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed</title>
  <script>
    window.opener?.postMessage({ type: 'connector_authenticated', connector_type: '${type}', success: false, error: '${reason}' }, '*');
    window.close();
  </script>
</head>
<body>
  <p>Connection failed: ${reason}</p>
</body>
</html>`,
      { headers: { 'Content-Type': 'text/html' }, status: 400 }
    );
  }
}
