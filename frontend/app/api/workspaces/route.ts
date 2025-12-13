/**
 * Workspaces API Route
 * Handles CRUD operations for workspaces
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getUserWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace
} from '@/lib/supabase/workspaces'

/**
 * GET /api/workspaces
 * Get all workspaces for the current user
 * Query params: includeArchived (boolean)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const includeArchived = searchParams.get('includeArchived') === 'true'

    const workspaces = await getUserWorkspaces(includeArchived)

    return NextResponse.json({
      success: true,
      workspaces,
      count: workspaces.length
    })
  } catch (error) {
    console.error('Error fetching workspaces:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch workspaces',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/workspaces
 * Create a new workspace
 * Body: { name: string, description?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { name, description } = body

    if (!name) {
      return NextResponse.json(
        { error: 'Workspace name is required' },
        { status: 400 }
      )
    }

    const workspace = await createWorkspace(name, description)

    return NextResponse.json({
      success: true,
      workspace
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating workspace:', error)
    return NextResponse.json(
      {
        error: 'Failed to create workspace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/workspaces
 * Update or archive a workspace
 * Body: { workspaceId: string, name?: string, description?: string, archive?: boolean }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { workspaceId, name, description, archive } = body

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      )
    }

    // Handle name/description updates
    const workspace = await updateWorkspace(workspaceId, { name, description })

    return NextResponse.json({
      success: true,
      workspace
    })
  } catch (error) {
    console.error('Error updating workspace:', error)
    return NextResponse.json(
      {
        error: 'Failed to update workspace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/workspaces
 * Permanently delete a workspace (cascades to documents and instructions!)
 * Body: { workspaceId: string }
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { workspaceId } = body

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      )
    }

    await deleteWorkspace(workspaceId)

    return NextResponse.json({
      success: true,
      message: 'Workspace permanently deleted'
    })
  } catch (error) {
    console.error('Error deleting workspace:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete workspace',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
