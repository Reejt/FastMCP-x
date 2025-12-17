/**
 * Chats API Route
 * Connects frontend page.tsx to Supabase via chats.ts service layer
 * 
 * Flow: page.tsx → /api/chats/route.ts → chats.ts → Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getWorkspaceChats,
  createChatMessage,
  deleteChatMessage
} from '@/lib/supabase/chats'

/**
 * GET /api/chats?workspaceId=xxx
 * Fetch all chats for a workspace
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'workspaceId is required' },
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
    const chats = await getWorkspaceChats(workspaceId)

    return NextResponse.json({ success: true, chats })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/chats
 * Create a new chat message
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, role, message } = body

    if (!workspaceId || !role || !message) {
      return NextResponse.json(
        { error: 'workspaceId, role, and message are required' },
        { status: 400 }
      )
    }

    if (!message.trim()) {
      return NextResponse.json(
        { error: 'Message cannot be empty' },
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
    const chat = await createChatMessage(workspaceId, role, message)

    return NextResponse.json({ success: true, chat })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/chats?chatId=xxx
 * Delete a chat message
 */
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const chatId = searchParams.get('chatId')

    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required' },
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
    await deleteChatMessage(chatId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
