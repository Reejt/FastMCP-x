import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  createGeneralChatMessage
} from '@/lib/supabase/chats'
import type { Chat } from '@/app/types'

/**
 * POST /api/chats/general
 * Save a message to general chat
 *
 * Body: { sessionId: string, role: string, message: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, role, message } = body

    if (!sessionId || !role || !message) {
      return NextResponse.json(
        { error: 'sessionId, role, and message are required' },
        { status: 400 }
      )
    }

    if (!message.trim()) {
      return NextResponse.json({ error: 'Message cannot be empty' }, { status: 400 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Save message to general chat
    const chat = await createGeneralChatMessage(sessionId, role, message)

    return NextResponse.json({
      success: true,
      chat
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
