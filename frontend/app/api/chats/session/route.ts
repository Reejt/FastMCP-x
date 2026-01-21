/**
 * Single Session API Route
 * Handles individual session operations (get messages, update title, delete)
 * 
 * Flow: page.tsx → /api/chats/session → lib/supabase/chats.ts → Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getSessionMessages,
  getSessionById,
  updateSessionTitle,
  deleteSession
} from '@/lib/supabase/chats'
import { chatsToMessages } from '@/app/types'

/**
 * GET /api/chats/session?sessionId=xxx
 * Fetch all messages for a specific session
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

    // Verify session exists and user has access
    const session = await getSessionById(sessionId)
    
    // Fetch messages for this session
    const chats = await getSessionMessages(sessionId)
    
    // Convert DB format (Chat[]) to UI format (Message[])
    const messages = chatsToMessages(chats)

    return NextResponse.json({ 
      success: true, 
      messages,
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
 * PATCH /api/chats/session
 * Update session title
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
    const session = await updateSessionTitle(sessionId, title)

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
 * DELETE /api/chats/session?sessionId=xxx
 * Soft delete a session (sets deleted_at timestamp)
 * Messages are cascade-deleted by database FK constraint
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

    // Use service layer function (soft delete)
    await deleteSession(sessionId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
