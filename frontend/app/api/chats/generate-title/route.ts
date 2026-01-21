/**
 * Chat Title Generation API Route
 * Generates descriptive titles for chat sessions using LLM
 * 
 * Flow: Frontend → /api/chats/generate-title → Bridge Server → Ollama
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BRIDGE_SERVER_URL = process.env.NEXT_PUBLIC_BRIDGE_SERVER_URL || 'http://localhost:3001'

/**
 * POST /api/chats/generate-title
 * Generate a descriptive title for a chat session based on the first message
 * 
 * Body: { message: string }
 * Returns: { success: boolean, title: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { message } = body

    console.log('📝 Title generation API called with message:', message?.substring(0, 100))

    if (!message || typeof message !== 'string' || !message.trim()) {
      console.error('❌ Invalid message provided')
      return NextResponse.json(
        { error: 'message is required and must be a non-empty string' },
        { status: 400 }
      )
    }

    // Verify user authentication
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.error('❌ User not authenticated')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('✅ User authenticated, calling bridge server at:', BRIDGE_SERVER_URL)

    // Call bridge server to generate title
    const response = await fetch(`${BRIDGE_SERVER_URL}/generate-title`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: message.trim()
      })
    })

    if (!response.ok) {
      console.error('❌ Bridge server error:', response.status, response.statusText)
      // Fallback: create title from first few words
      const words = message.trim().split(/\s+/).slice(0, 5)
      const fallbackTitle = words.join(' ')
      console.log('⚠️ Using fallback title:', fallbackTitle)
      return NextResponse.json({
        success: true,
        title: fallbackTitle.length > 50 ? fallbackTitle.slice(0, 47) + '...' : fallbackTitle
      })
    }

    const data = await response.json()
    console.log('✅ Bridge server response:', data)

    return NextResponse.json({
      success: true,
      title: data.title || 'New Chat'
    })

  } catch (error) {
    console.error('Title generation error:', error)
    
    // Return a basic fallback instead of failing completely
    return NextResponse.json({
      success: true,
      title: 'New Chat'
    })
  }
}
