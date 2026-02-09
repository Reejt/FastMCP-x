import { NextRequest, NextResponse } from 'next/server';

const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'http://localhost:3001';

/**
 * GET /api/connectors — List all available connectors from registry
 */
export async function GET() {
  try {
    const response = await fetch(`${BRIDGE_SERVER_URL}/api/connectors`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Bridge server error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching connectors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch connectors', connectors: [] },
      { status: 500 }
    );
  }
}

/**
 * POST /api/connectors — List user's connected services with status
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    const response = await fetch(`${BRIDGE_SERVER_URL}/api/connectors/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      throw new Error(`Bridge server error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching user connectors:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user connectors', connectors: [] },
      { status: 500 }
    );
  }
}
