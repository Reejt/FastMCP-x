import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET: Get or create default workspace for authenticated user
 * Returns the first workspace if it exists, otherwise creates a new "Default" workspace
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user has any workspaces
    const { data: workspaces, error: selectError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1);

    if (selectError) {
      console.error('Error fetching workspaces:', selectError);
      return NextResponse.json(
        { error: 'Failed to fetch workspaces' },
        { status: 500 }
      );
    }

    // Return existing workspace if found
    if (workspaces && workspaces.length > 0) {
      return NextResponse.json({
        success: true,
        workspace: workspaces[0],
        isNew: false
      });
    }

    // Create default workspace
    const { data: newWorkspace, error: createError } = await supabase
      .from('workspaces')
      .insert({
        name: 'Default',
        description: 'Your default workspace for vault files',
        user_id: user.id
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating default workspace:', createError);
      return NextResponse.json(
        { error: 'Failed to create default workspace' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      workspace: newWorkspace,
      isNew: true
    });
  } catch (error) {
    console.error('Error in default workspace endpoint:', error);
    return NextResponse.json(
      {
        error: 'Failed to get or create default workspace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
