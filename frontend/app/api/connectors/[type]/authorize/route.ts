import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// OAuth configuration per provider
const OAUTH_CONFIG: Record<string, {
  auth_url: string;
  scopes: string[];
  client_id_env: string;
  extra_params?: Record<string, string>;
}> = {
  gdrive: {
    auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    client_id_env: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    extra_params: { access_type: 'offline', prompt: 'consent' },
  },
  gmail: {
    auth_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    client_id_env: 'NEXT_PUBLIC_GOOGLE_CLIENT_ID',
    extra_params: { access_type: 'offline', prompt: 'consent' },
  },
  slack: {
    auth_url: 'https://slack.com/oauth/v2/authorize',
    scopes: ['channels:history', 'channels:read', 'users:read', 'users.profile:read', 'search:read'],
    client_id_env: 'NEXT_PUBLIC_SLACK_CLIENT_ID',
  },
  onedrive: {
    auth_url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    scopes: ['Files.Read.All', 'Sites.Read.All', 'offline_access'],
    client_id_env: 'NEXT_PUBLIC_MICROSOFT_CLIENT_ID',
    extra_params: { response_mode: 'query' },
  },
};

/**
 * GET /api/connectors/[type]/authorize
 * Generates OAuth authorization URL and redirects to provider
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  const config = OAUTH_CONFIG[type];
  if (!config) {
    return NextResponse.json(
      { error: `Unknown connector type: ${type}` },
      { status: 404 }
    );
  }

  const clientId = process.env[config.client_id_env];
  if (!clientId) {
    return NextResponse.json(
      { error: `OAuth not configured for ${type}. Missing ${config.client_id_env}` },
      { status: 500 }
    );
  }

  // Get the authenticated user
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() { /* not needed for reading */ },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  // Generate CSRF token
  const csrfToken = crypto.randomUUID();
  const origin = request.nextUrl.origin;
  const redirectUri = `${origin}/api/connectors/${type}/callback`;

  // Build state parameter
  const state = JSON.stringify({
    user_id: user.id,
    connector_type: type,
    csrf_token: csrfToken,
  });

  // Build authorization URL
  const authUrl = new URL(config.auth_url);
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', Buffer.from(state).toString('base64'));

  // Set scopes (Slack uses user_scope instead of scope)
  if (type === 'slack') {
    authUrl.searchParams.set('user_scope', config.scopes.join(','));
  } else {
    authUrl.searchParams.set('scope', config.scopes.join(' '));
  }

  // Add extra params
  if (config.extra_params) {
    for (const [key, value] of Object.entries(config.extra_params)) {
      authUrl.searchParams.set(key, value);
    }
  }

  // Set CSRF token in cookie
  const response = NextResponse.redirect(authUrl.toString());
  response.cookies.set('connector_csrf', csrfToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 600, // 10 minutes
    path: '/',
  });

  return response;
}
