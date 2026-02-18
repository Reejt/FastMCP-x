/**
 * Single General Chat Session API Route
 * Handles individual general session operations (get messages, update title, delete)
 *
 * Flow: page.tsx → /api/chats/general/session → lib/supabase/chats.ts → Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getGeneralChatMessages,
  updateGeneralChatSessionTitle,
  deleteGeneralChatSession
} from '@/lib/supabase/chats'
import { chatsToMessages } from '@/app/types'

/**
 * GET /api/chats/general/session?sessionId=xxx
 * Fetch all messages for a specific general chat session
 * Returns messages in UI format (Message[]) not DB format (Chat[])
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Fetch messages for this general chat session
    const chats = await getGeneralChatMessages(sessionId)

    // Convert DB format (Chat[]) to UI format (Message[])
    const messages = chatsToMessages(chats)

    return NextResponse.json({
      success: true,
      messages
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/chats/general/session
 * Update general chat session title
 *
 * Body: { sessionId: string, title: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { sessionId, title } = body

    if (!sessionId || !title) {
      return NextResponse.json(
        { error: 'sessionId and title are required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Use service layer function
    const session = await updateGeneralChatSessionTitle(sessionId, title)

    return NextResponse.json({
      success: true,
      session
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/chats/general/session?sessionId=xxx
 * Soft delete a general chat session
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const sessionId = searchParams.get('sessionId')

    if (!sessionId) {
      return NextResponse.json(
        { error: 'sessionId is required' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Use service layer function
    await deleteGeneralChatSession(sessionId)

    return NextResponse.json({
      success: true
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
