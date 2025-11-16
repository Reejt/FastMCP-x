/**
 * Workspace Instructions API Route
 * Handles CRUD operations for workspace instructions
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getWorkspaceInstructions,
  getActiveInstruction,
  createInstruction,
  updateInstruction,
  activateInstruction,
  deactivateInstruction,
  deleteInstruction,
  switchActiveInstruction
} from '@/lib/supabase/instructions'

/**
 * GET /api/instructions
 * Get instructions for a workspace
 * Query params: workspaceId (required), activeOnly (boolean)
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
    const activeOnly = searchParams.get('activeOnly') === 'true'

    if (!workspaceId) {
      return NextResponse.json(
        { error: 'Workspace ID is required' },
        { status: 400 }
      )
    }

    let instructions

    if (activeOnly) {
      const activeInstruction = await getActiveInstruction(workspaceId)
      instructions = activeInstruction ? [activeInstruction] : []
    } else {
      instructions = await getWorkspaceInstructions(workspaceId, false)
    }

    return NextResponse.json({
      success: true,
      instructions,
      count: instructions.length
    })
  } catch (error) {
    console.error('Error fetching instructions:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch instructions',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/instructions
 * Create a new instruction
 * Body: { workspaceId: string, title: string, content: string, isActive?: boolean }
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
    const { workspaceId, title, content, isActive } = body

    if (!workspaceId || !title || !content) {
      return NextResponse.json(
        { error: 'Workspace ID, title, and content are required' },
        { status: 400 }
      )
    }

    const instruction = await createInstruction(
      workspaceId,
      title,
      content,
      isActive || false
    )

    return NextResponse.json({
      success: true,
      instruction
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating instruction:', error)
    return NextResponse.json(
      {
        error: 'Failed to create instruction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/instructions
 * Update, activate, or deactivate an instruction
 * Body: { 
 *   instructionId: string, 
 *   title?: string, 
 *   content?: string,
 *   activate?: boolean,
 *   deactivate?: boolean,
 *   switchTo?: boolean (with workspaceId)
 * }
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
    const {
      instructionId,
      title,
      content,
      activate,
      deactivate,
      switchTo,
      workspaceId
    } = body

    if (!instructionId) {
      return NextResponse.json(
        { error: 'Instruction ID is required' },
        { status: 400 }
      )
    }

    let instruction

    // Handle activation/deactivation
    if (activate) {
      instruction = await activateInstruction(instructionId)
    } else if (deactivate) {
      instruction = await deactivateInstruction(instructionId)
    } else if (switchTo && workspaceId) {
      instruction = await switchActiveInstruction(workspaceId, instructionId)
    } else {
      // Handle content updates
      instruction = await updateInstruction(instructionId, { title, content })
    }

    return NextResponse.json({
      success: true,
      instruction
    })
  } catch (error) {
    console.error('Error updating instruction:', error)
    return NextResponse.json(
      {
        error: 'Failed to update instruction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/instructions
 * Permanently delete an instruction
 * Body: { instructionId: string }
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
    const { instructionId } = body

    if (!instructionId) {
      return NextResponse.json(
        { error: 'Instruction ID is required' },
        { status: 400 }
      )
    }

    await deleteInstruction(instructionId)

    return NextResponse.json({
      success: true,
      message: 'Instruction deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting instruction:', error)
    return NextResponse.json(
      {
        error: 'Failed to delete instruction',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
