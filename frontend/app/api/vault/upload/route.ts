import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getWorkspaceFiles } from '@/lib/supabase/documents';

// ============================================
// CONFIGURATION FOR LARGE FILE UPLOADS
// ============================================
// Explicitly specify Node runtime (not Edge) for streaming support
// Edge runtime has restrictions on streaming and large payloads
export const runtime = 'nodejs';

// App Router: Set timeouts and memory limits for large files
export const maxDuration = 300; // 5 minutes timeout for large uploads
export const dynamic = 'force-dynamic';

// For App Router, the 10MB limit is enforced at the server level
// To accept larger files, ensure your deployment supports it:
// - Vercel: Set maxBodySize in vercel.json or via env
// - Self-hosted: Configure in server (nginx, Node.js, etc.)
// - Development: Works as-is with larger limits

// Server-side env variable (no NEXT_PUBLIC_ prefix needed in API routes)
// Defaults to localhost:3001 for local development (npm run dev)
// Set BRIDGE_SERVER_URL env variable for Docker or custom deployments
const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const workspaceId = formData.get('workspaceId') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // If no workspaceId provided, get or create default workspace
    let _finalWorkspaceId: string | null = workspaceId || null;

    if (!_finalWorkspaceId) {
      // Get or create default workspace
      try {
        const { data: workspaces, error: selectError } = await supabase
          .from('workspaces')
          .select('id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(1);

        if (selectError || !workspaces || workspaces.length === 0) {
          // Create default workspace
          const { data: newWorkspace, error: createError } = await supabase
            .from('workspaces')
            .insert({
              name: 'Default',
              description: 'Your default workspace for vault files',
              user_id: user.id
            })
            .select('id')
            .single();

          if (createError || !newWorkspace) {
            return NextResponse.json(
              { error: 'Failed to create default workspace' },
              { status: 500 }
            );
          }
          _finalWorkspaceId = newWorkspace.id;
        } else {
          _finalWorkspaceId = workspaces[0].id;
        }
      } catch (error) {
        return NextResponse.json(
          { error: 'Failed to handle workspace' },
          { status: 500 }
        );
      }
    } else {
      // Validate provided workspace_id exists and belongs to user
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .eq('user_id', user.id)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json(
          { error: 'Invalid workspace ID' },
          { status: 403 }
        );
      }
    }

    // Validate file type (MIME type and extension-based)
    const allowedMimeTypes = [
      'text/plain',
      'text/markdown',
      'text/csv',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'application/json',
      'application/x-yaml',
      'application/x-sh',
      'application/x-sql',
      'application/graphql',
      'application/octet-stream' // Fallback for source code files
    ];

    // Allowed file extensions for source code and configuration files
    const allowedExtensions = [
      '.py', '.js', '.ts', '.java', '.cpp', '.c', '.h', '.cs', '.go', '.rs',
      '.html', '.css', '.scss', '.jsx', '.tsx', '.json', '.yaml', '.yml',
      '.toml', '.ini', '.env', '.md', '.sh', '.bat', '.ps1', '.sql', '.prisma', '.graphql',
      '.dockerignore', '.gitignore'
    ];

    // Get file extension
    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.')) || '';
    
    // Check if extension is in allowed list (handles dotfiles like .gitignore)
    const isAllowedExtension = allowedExtensions.includes(fileExtension) || 
                               allowedExtensions.includes('.' + fileName.split('/').pop());
    
    // Validate: either MIME type is allowed OR file extension is allowed
    const isValidFileType = allowedMimeTypes.includes(file.type) || isAllowedExtension;

    if (!isValidFileType) {
      return NextResponse.json(
        { error: 'File type not supported' },
        { status: 400 }
      );
    }

    // Convert file to base64 for transmission to bridge server
    const arrayBuffer = await file.arrayBuffer();
    const base64Content = Buffer.from(arrayBuffer).toString('base64');

    // Prepare request body for bridge server
    const requestBody = {
      file_name: file.name,
      file_content: base64Content,
      file_type: file.type,
      file_size: file.size,
      user_id: user.id,
      workspace_id: _finalWorkspaceId
    };

    // Call the bridge server ingest endpoint
    const response = await fetch(`${BRIDGE_SERVER_URL}/api/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000), // 120s timeout for file processing
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || 'Failed to process file' },
        { status: response.status }
      );
    }

    const data = await response.json();

    return NextResponse.json({
      success: true,
      message: 'File uploaded and processed successfully',
      file_name: file.name,
      file_size: file.size,
      file_type: file.type,
      ...data
    });
  } catch (error) {
    console.error('Error uploading file:', error);

    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        {
          error: 'Upload timeout - File processing is taking too long. Please try again.',
        },
        { status: 504 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to upload file',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// GET method to list uploaded files from Supabase
export async function GET(request: NextRequest) {
  try {
    // Authenticate user first
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    if (workspaceId) {
      // Verify workspace exists and belongs to user
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .eq('user_id', user.id)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json(
          { error: 'Workspace not found or access denied' },
          { status: 403 }
        );
      }

      // Use documents service layer to fetch workspace files
      const files = await getWorkspaceFiles(workspaceId);

      return NextResponse.json({
        success: true,
        files: files || [],
        count: files?.length || 0,
        workspaceId: workspaceId
      });
    } else {
      // No workspaceId provided - fetch files from ALL workspaces for this user
      const { data: files, error: filesError } = await supabase
        .from('file_upload')
        .select('*')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .order('uploaded_at', { ascending: false });

      if (filesError) {
        console.error('Error fetching all files:', filesError);
        throw filesError;
      }

      return NextResponse.json({
        success: true,
        files: files || [],
        count: files?.length || 0,
        workspaceId: null
      });
    }
  } catch (error) {
    console.error('Error fetching files:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch uploaded files',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// DELETE method to remove a file from both storage and database
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get document ID from request body (supports both 'id' and 'documentId' for backward compatibility)
    const body = await request.json();
    const id = body.id || body.documentId;

    if (!id) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    // First, fetch the file to verify ownership and get the file path
    const { data: file, error: fetchError } = await supabase
      .from('file_upload')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)  // Verify file belongs to current user
      .is('deleted_at', null)
      .single();

    if (fetchError || !file) {
      console.error('File fetch error:', fetchError);
      return NextResponse.json(
        { error: 'File not found or already deleted' },
        { status: 404 }
      );
    }

    // Soft delete in database (set deleted_at timestamp)
    const { error: dbError } = await supabase
      .from('file_upload')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id);  // Ensure only owner can delete

    if (dbError) {
      console.error('Database deletion error:', dbError);
      return NextResponse.json(
        { error: 'Failed to delete document from database', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'File deleted successfully',
      id: id
    });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete file',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}