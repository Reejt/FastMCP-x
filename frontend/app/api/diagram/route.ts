import { NextRequest, NextResponse } from 'next/server'

/**
 * Diagram API Route
 * Forwards diagram generation requests to bridge server /api/diagram endpoint
 */

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { query, diagram_type = 'auto' } = body

    if (!query) {
      return NextResponse.json(
        { error: 'query is required' },
        { status: 400 }
      )
    }

    // Determine bridge server URL
    const bridgeUrl = process.env.NEXT_PUBLIC_BRIDGE_SERVER_URL || 
                      process.env.BRIDGE_SERVER_URL || 
                      'http://localhost:3001'

    const diagramApiUrl = `${bridgeUrl}/api/diagram`

    console.log(`📊 Forwarding diagram request to: ${diagramApiUrl}`)
    console.log(`   Type: ${diagram_type}, Query length: ${query.length}`)

    // Forward request to bridge server with streaming
    const response = await fetch(diagramApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        diagram_type
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`❌ Diagram API error: ${response.status} ${response.statusText}`)
      console.error(`   Response: ${errorText.substring(0, 200)}`)
      
      return NextResponse.json(
        { 
          error: `Bridge server diagram generation failed: ${response.statusText}`,
          status: response.status
        },
        { status: response.status }
      )
    }

    // Return streaming response directly from bridge server
    const contentType = response.headers.get('content-type')
    if (contentType?.includes('text/event-stream')) {
      console.log('📡 Streaming SSE response from bridge server')
      
      return new NextResponse(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      })
    } else {
      // Non-streaming response
      const data = await response.json()
      console.log(`✅ Diagram generated (type: ${data.diagram_type})`)
      
      return NextResponse.json(data)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    console.error(`🛑 Diagram API error: ${errorMessage}`)
    
    return NextResponse.json(
      { error: `Diagram generation failed: ${errorMessage}` },
      { status: 500 }
    )
  }
}
