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

    // Validate workspace_id if provided
    if (workspaceId) {
      const { data: workspace, error: workspaceError } = await supabase
        .from('workspaces')
        .select('id')
        .eq('id', workspaceId)
        .eq('owner_id', user.id)
        .single();

      if (workspaceError || !workspace) {
        return NextResponse.json(
          { error: 'Invalid workspace ID or access denied' },
          { status: 403 }
        );
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
      signal: AbortSignal.timeout(30000), // 30s timeout for file processing
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

    // Insert document metadata into vault_documents table
    const { data: dbData, error: dbError } = await supabase
      .from('vault_documents')
      .insert({
        user_id: user.id,
        workspace_id: workspaceId || null, // Include workspace_id
        file_name: file.name,
        file_path: storageData.path,
        file_size: file.size,
        file_type: file.type,
        metadata: {
          original_name: file.name,
          processed: true,
          bridge_server_response: data
        }
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

    // Build query
    let query = supabase
      .from('vault_documents')
      .select('*')
      .eq('user_id', user.id)
      .order('upload_timestamp', { ascending: false });

    // Filter by workspace if provided
    if (workspaceId) {
      query = query.eq('workspace_id', workspaceId);
    }

    const { data: documents, error: dbError } = await query;

    if (dbError) {
      console.error('Database query error:', dbError);
      return NextResponse.json(
        { error: 'Failed to fetch documents', details: dbError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      documents: documents || [],
      count: documents?.length || 0,
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

    // First, fetch the document to get the file path and verify ownership
    const { data: document, error: fetchError } = await supabase
      .from('vault_documents')
      .select('*')
      .eq('document_id', documentId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !document) {
      console.error('Document fetch error:', fetchError);
      return NextResponse.json(
        { error: 'Document not found or access denied' },
        { status: 404 }
      );
    }

    // Delete from Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('vault-files')
      .remove([document.file_path]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
      // Continue with database deletion even if storage deletion fails
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('vault_documents')
      .delete()
      .eq('document_id', documentId)
      .eq('user_id', user.id);

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