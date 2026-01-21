/**
 * Workspace Instructions API Route
 * Connects frontend page.tsx and components to Supabase via instructions.ts service layer
 * 
 * Flow: page.tsx → route.ts → instructions.ts → Supabase
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getWorkspaceInstructions,
  getInstructionById,
  createInstruction,
  updateInstruction,
  activateInstruction,
  deactivateInstruction,
  deleteInstruction
} from '@/lib/supabase/instructions'

/**
 * Helper function to clear instruction cache on the backend
 */
async function clearBackendInstructionCache(workspaceId: string) {
  try {
    // Defaults to localhost:3001 for local development (npm run dev)
    const bridgeServerUrl = process.env.BRIDGE_SERVER_URL || 'http://localhost:3001'
    await fetch(`${bridgeServerUrl}/api/clear-instruction-cache?workspace_id=${workspaceId}`, {
      method: 'POST'
    })
    console.log(`✅ Cleared backend cache for workspace: ${workspaceId}`)
  } catch (error) {
    console.warn(`⚠️  Failed to clear backend instruction cache: ${error}`)
    // Don't fail the request if cache clearing fails - just log warning
  }
}

/**
 * GET /api/instructions?workspaceId=X
 * Fetch all instructions for a workspace
 */
export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Workspace ID is required'
        },
        { status: 400 }
      )
    }

    const instructions = await getWorkspaceInstructions(workspaceId)

    return NextResponse.json({
      success: true,
      instructions
    })
  } catch (error) {
    console.error('Error fetching instructions:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch instructions'
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/instructions
 * Create a new instruction
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { workspaceId, title, instructions, isActive } = body

    if (!workspaceId || !title || !instructions) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: workspaceId, title, instructions'
        },
        { status: 400 }
      )
    }

    const instruction = await createInstruction(
      workspaceId,
      title,
      instructions,
      isActive
    )

    // Clear backend cache after creating instruction
    await clearBackendInstructionCache(workspaceId)

    return NextResponse.json({
      success: true,
      instruction
    })
  } catch (error) {
    console.error('Error creating instruction:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create instruction'
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/instructions
 * Update, activate, or deactivate an instruction
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { instructionId, title, instructions, activate, deactivate } = body

    if (!instructionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Instruction ID is required'
        },
        { status: 400 }
      )
    }

    let instruction

    // First, update content if provided
    if (title !== undefined || instructions !== undefined) {
      const updates: { title?: string; content?: string } = {}
      if (title !== undefined) updates.title = title
      if (instructions !== undefined) updates.content = instructions
      instruction = await updateInstruction(instructionId, updates)
    }

    // Then, handle activation/deactivation
    if (activate) {
      instruction = await activateInstruction(instructionId)
    } else if (deactivate) {
      instruction = await deactivateInstruction(instructionId)
    } else if (!instruction) {
      return NextResponse.json(
        {
          success: false,
          error: 'No updates provided'
        },
        { status: 400 }
      )
    }

    // Clear backend cache after any instruction change
    if (instruction && instruction.workspace_id) {
      await clearBackendInstructionCache(instruction.workspace_id)
    }

    return NextResponse.json({
      success: true,
      instruction
    })
  } catch (error) {
    console.error('Error updating instruction:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update instruction'
      },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/instructions
 * Delete an instruction
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json()
    const { instructionId } = body

    if (!instructionId) {
      return NextResponse.json(
        {
          success: false,
          error: 'Instruction ID is required'
        },
        { status: 400 }
      )
    }

    // Get instruction before deleting to know which workspace to clear cache for
    const instruction = await getInstructionById(instructionId)

    await deleteInstruction(instructionId)

    // Clear backend cache after deletion
    if (instruction && instruction.workspace_id) {
      await clearBackendInstructionCache(instruction.workspace_id)
    }

    return NextResponse.json({
      success: true,
      message: 'Instruction deleted successfully'
    })
  } catch (error) {
    console.error('Error deleting instruction:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete instruction'
      },
      { status: 500 }
    )
  }
}
