import { NextRequest, NextResponse } from 'next/server';

const BRIDGE_SERVER_URL = process.env.BRIDGE_SERVER_URL || 'http://localhost:3001';

/**
 * GET /api/connectors/[type]/tools
 * List available capabilities for a connector
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  try {
    const response = await fetch(
      `${BRIDGE_SERVER_URL}/api/connectors/${type}/tools`,
      { signal: AbortSignal.timeout(10000) }
    );

    if (!response.ok) {
      throw new Error(`Bridge server error: ${response.statusText}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error(`Error fetching tools for ${type}:`, error);
    return NextResponse.json(
      { error: `Failed to fetch tools for ${type}`, capabilities: [] },
      { status: 500 }
    );
  }
}
