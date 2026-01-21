/**
 * Chat Sessions API Route
 * Handles session management operations (list, create)
 * 
 * Flow: page.tsx → /api/chats/sessions → lib/supabase/chats.ts → Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getWorkspaceSessions,
  createChatSession,
  getWorkspaceSessionCount
} from '@/lib/supabase/chats'

/**
 * GET /api/chats/sessions?workspaceId=xxx
 * Fetch all active sessions for a workspace (excluding soft-deleted)
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
    const sessions = await getWorkspaceSessions(workspaceId)
    const sessionCount = await getWorkspaceSessionCount(workspaceId)

    return NextResponse.json({ 
      success: true, 
      sessions,
      count: sessionCount
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
 * POST /api/chats/sessions
 * Create a new chat session
 * 
 * Body: { workspaceId: string, title?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, title } = body

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
    // Title defaults to "New Chat" if not provided
    const session = await createChatSession(workspaceId, title || 'New Chat')

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
