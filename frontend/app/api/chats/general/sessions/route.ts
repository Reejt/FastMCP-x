/**
 * General Chat Sessions API Route
 * Handles general chat session management (list, create)
 *
 * Flow: page.tsx → /api/chats/general/sessions → lib/supabase/chats.ts → Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getUserGeneralChatSessions,
  getOrCreateGeneralChatSession
} from '@/lib/supabase/chats'

/**
 * GET /api/chats/general/sessions
 * Fetch all general chat sessions for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const sessions = await getUserGeneralChatSessions()

    return NextResponse.json({
      success: true,
      sessions
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * POST /api/chats/general/sessions
 * Create a new general chat session
 *
 * Body: { title?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title } = body

    const supabase = await createClient()
    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Use service layer function
    // Title defaults to "General Chat" if not provided
    const session = await getOrCreateGeneralChatSession(title || 'General Chat')

    return NextResponse.json({
      success: true,
      session
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}



