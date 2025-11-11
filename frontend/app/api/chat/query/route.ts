import { NextRequest, NextResponse } from 'next/server';

// Server-side env variable (no NEXT_PUBLIC_ prefix needed in API routes)
const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'http://localhost:3001';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, action = 'query', conversation_history = [] } = body;

    if (!query) {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // Determine which endpoint to call based on action
    let endpoint = '/api/query';
    let requestBody: any = { query, conversation_history };

    switch (action) {
      case 'query_excel':
        endpoint = '/api/query-excel';
        requestBody = {
          file_path: body.file_path,
          query,
          sheet_name: body.sheet_name
        };
        break;
      default:
        endpoint = '/api/query';
        requestBody = { query, conversation_history };
    }

    // Call the bridge server with timeout for long LLM operations
    const response = await fetch(`${BRIDGE_SERVER_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(120000), // 120s timeout for LLM operations
    });

    if (!response.ok) {
      const error = await response.json();
      return NextResponse.json(
        { error: error.detail || 'Bridge server error' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error calling bridge server:', error);
    
    // Handle timeout specifically
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { 
          error: 'Request timeout - The AI is taking too long to respond. Please try again.',
        },
        { status: 504 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to connect to bridge server',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
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
