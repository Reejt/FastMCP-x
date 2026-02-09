import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * GET /api/connectors/[type]/check-token
 * Check if user already has a saved token for the connector
 * Helps skip unnecessary authorize redirects
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  try {
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
        { has_token: false, message: 'Authentication required' },
        { status: 401 }
      );
    }

    // Check if user has a saved token for this connector
    const { data, error } = await supabase
      .from('user_connectors')
      .select('id, is_active')
      .eq('user_id', user.id)
      .eq('connector_type', type)
      .single();

    if (error || !data) {
      return NextResponse.json({
        has_token: false,
        message: 'No token found',
      });
    }

    return NextResponse.json({
      has_token: true,
      is_active: data.is_active,
      message: `Token exists for ${type}`,
    });
  } catch (error) {
    console.error('Error checking token:', error);
    return NextResponse.json(
      { has_token: false, error: 'Failed to check token status' },
      { status: 500 }
    );
  }
}
