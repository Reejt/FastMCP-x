import { NextRequest, NextResponse } from 'next/server';

// Server-side env variable (no NEXT_PUBLIC_ prefix needed in API routes)
// Defaults to localhost:3001 for local development
const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, action = 'query', conversation_history = [], workspace_id, selected_file_ids } = body;

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // Build request body
    let requestBody: { query: string; conversation_history?: unknown[]; workspace_id?: string; selected_file_ids?: string[] } = {
      query,
      conversation_history,
      workspace_id,
      selected_file_ids,
    };

    // All requests use the same /api/query endpoint
    const endpoint = '/api/query';

    // Call the bridge server - streaming response
    const response = await fetch(`${BRIDGE_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      let errorMessage = 'Bridge server error';
      const contentType = response.headers.get('content-type');
      
      try {
        if (contentType?.includes('application/json')) {
          const error = await response.json();
          errorMessage = error.detail || error.error || 'Bridge server error';
        } else {
          // If not JSON (e.g., HTML error page), use status text
          errorMessage = `Bridge server error: ${response.statusText}`;
        }
      } catch {
        errorMessage = `Bridge server error: ${response.statusText}`;
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    // For streaming responses (SSE), forward the stream to the client
    if (response.headers.get('content-type')?.includes('text/event-stream')) {
      // Create a new ReadableStream to forward the SSE data
      const stream = new ReadableStream({
        async start(controller) {
          const reader = response.body?.getReader();

          try {
            while (true) {
              const { done, value } = await reader!.read();

              if (done) {
                controller.close();
                break;
              }

              // Forward the SSE chunk
              controller.enqueue(value);
            }
          } catch (error) {
            console.error('Stream error:', error);
            controller.error(error);
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Fallback for non-streaming responses
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error calling bridge server:', error);

    // Check if it's a connection error
    const isConnectionError = error instanceof Error && (
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('fetch failed') ||
      error.message.includes('Network request failed')
    );

    return NextResponse.json(
      {
        error: isConnectionError 
          ? 'Bridge server is not running. Please start it with: python3 bridge_server.py'
          : 'Failed to connect to bridge server',
        details: error instanceof Error ? error.message : 'Unknown error',
        hint: isConnectionError 
          ? 'The bridge server connects the frontend to the backend. Make sure it\'s running on port 3001.'
          : undefined
      },
      { status: isConnectionError ? 503 : 500 }
    );
  }
}

export async function GET() {
  try {
    // Health check endpoint with 5s timeout
    const response = await fetch(`${BRIDGE_SERVER_URL}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      throw new Error('Bridge server returned error status');
    }

    const data = await response.json();
    return NextResponse.json({
      status: 'healthy',
      bridge: data,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Bridge server not reachable',
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    );
  }
}
