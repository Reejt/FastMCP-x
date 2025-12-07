import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Server-side env variable (no NEXT_PUBLIC_ prefix needed in API routes)
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

    // Get or create workspace
    let finalWorkspaceId = workspaceId;
    
    if (workspaceId) {
      // Validate provided workspace_id exists and belongs to user
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json(
          { error: 'Invalid workspace ID' },
          { status: 403 }
        );
      }
    } else {
      // Get or create default workspace for the current user
      const { data: existingWorkspaces, error: wsListError } = await supabase
        .from('file_upload')
        .select('workspace_id')
        .eq('user_id', user.id)
        .order('uploaded_at', { ascending: false })
        .limit(1);

      if (existingWorkspaces && existingWorkspaces.length > 0) {
        finalWorkspaceId = existingWorkspaces[0].workspace_id;
      } else {
        // Create default workspace if user has none
        const { data: newWorkspace, error: createError } = await supabase
          .from('workspaces')
          .insert({
            name: 'Personal Workspace'
          })
          .select('id')
          .single();

        if (createError || !newWorkspace) {
          return NextResponse.json(
            { error: 'Failed to create default workspace' },
            { status: 500 }
          );
        }
        finalWorkspaceId = newWorkspace.id;
      }
    }

    // Validate file type (you can expand this list)
    const allowedTypes = [
      'text/plain',
      'text/markdown',
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
      'image/webp'
    ];

    if (!allowedTypes.includes(file.type)) {
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
      user_id: user.id  // Pass user ID for Supabase storage
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

    // Upload file to Supabase Storage
    const fileBuffer = await file.arrayBuffer();
    const fileName = `${user.id}/${Date.now()}_${file.name}`;

    const { data: storageData, error: storageError } = await supabase.storage
      .from('vault_files')
      .upload(fileName, fileBuffer, {
        contentType: file.type,
        upsert: false
      });

    console.log('Supabase storageData:', storageData);

    if (storageError) {
      console.error('Supabase storage error:', storageError);
      return NextResponse.json(
        { error: 'Failed to store file in vault', details: storageError.message },
        { status: 500 }
      );
    }

    // Insert file metadata into file_upload table
    const { data: dbData, error: dbError } = await supabase
      .from('file_upload')
      .insert({
        workspace_id: finalWorkspaceId,
        file_name: file.name,
        file_path: storageData.path,
        size_bytes: file.size,
        file_type: file.type,
        status: 'uploaded',
        user_id: user.id,
        uploaded_at: new Date().toISOString()
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Try to clean up the uploaded file
      await supabase.storage.from('vault_files').remove([fileName]);
      return NextResponse.json(
        { error: 'Failed to save document metadata', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'File uploaded and processed successfully',
      document: dbData,
      file_name: file.name,
      file_size: file.size,
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
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get workspace_id from query params (optional)
    const { searchParams } = new URL(request.url);
    const workspaceId = searchParams.get('workspaceId');

    // Build query - always filter by current user
    let query = supabase
      .from('file_upload')
      .select('id, workspace_id, file_name, file_path, size_bytes, status, uploaded_at')
      .eq('user_id', user.id)  // Only get files uploaded by current user
      .is('deleted_at', null)
      .order('uploaded_at', { ascending: false });

    // Filter by workspace if provided
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId)
    }

    const { data: files, error: dbError } = await query;

    if (dbError) {
      console.error('Database query error:', dbError);
      return NextResponse.json(
        { error: 'Failed to fetch documents', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      files: files || [],
      count: files?.length || 0,
      workspaceId: workspaceId || null
    });
  } catch (error) {
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

    // Get document ID from request body
    const body = await request.json();
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      );
    }

    // First, fetch the file to verify ownership and get the file path
    const { data: file, error: fetchError } = await supabase
      .from('file_upload')
      .select('*')
      .eq('id', documentId)
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
      .eq('id', documentId)
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
      documentId: documentId
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