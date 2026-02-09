import { NextRequest, NextResponse } from 'next/server';

const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'http://localhost:3001';

/**
 * POST /api/connectors/[type]/disconnect
 * Revoke and delete a connector
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  try {
    const body = await request.json();
    const { user_id } = body;

    if (!user_id) {
      return NextResponse.json(
        { error: 'user_id is required' },
        { status: 400 }
      );
    }

    const response = await fetch(
      `${BRIDGE_SERVER_URL}/api/connectors/${type}/disconnect`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id }),
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!response.ok) {
      throw new Error(`Bridge server error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Error disconnecting ${type}:`, error);
    return NextResponse.json(
      { error: `Failed to disconnect ${type}` },
      { status: 500 }
    );
  }
}
