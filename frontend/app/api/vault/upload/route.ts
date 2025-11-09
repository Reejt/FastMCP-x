import { NextRequest, NextResponse } from 'next/server';

// Server-side env variable (no NEXT_PUBLIC_ prefix needed in API routes)
const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
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
      file_size: file.size
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
    return NextResponse.json({
      success: true,
      message: 'File uploaded and processed successfully',
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

// Optional: Add GET method to list uploaded files
export async function GET() {
  try {
    const response = await fetch(`${BRIDGE_SERVER_URL}/api/list-files`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error('Failed to fetch file list');
    }

    const data = await response.json();
    return NextResponse.json(data);
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