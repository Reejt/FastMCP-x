/**
 * Workspace Instructions API Route
 * DISABLED: workspace_instructions table does not exist
 * Only files, workspaces, chats, and document_content tables are available
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Instructions functionality disabled - table does not exist
// import {
//   getWorkspaceInstructions,
//   getActiveInstruction,
//   createInstruction,
//   updateInstruction,
//   activateInstruction,
//   deactivateInstruction,
//   deleteInstruction,
//   switchActiveInstruction
// } from '@/lib/supabase/instructions'

/**
 * GET /api/instructions
 * DISABLED: workspace_instructions table does not exist
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { 
      error: 'Instructions feature not available',
      message: 'workspace_instructions table does not exist. Only files, workspaces, chats, and document_content tables are available.'
    },
    { status: 501 }
  )
}

/**
 * POST /api/instructions
 * DISABLED: workspace_instructions table does not exist
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { 
      error: 'Instructions feature not available',
      message: 'workspace_instructions table does not exist.'
    },
    { status: 501 }
  )
}

/**
 * PATCH /api/instructions
 * DISABLED: workspace_instructions table does not exist
 */
export async function PATCH(request: NextRequest) {
  return NextResponse.json(
    { 
      error: 'Instructions feature not available',
      message: 'workspace_instructions table does not exist.'
    },
    { status: 501 }
  )
}

/**
 * DELETE /api/instructions
 * DISABLED: workspace_instructions table does not exist
 */
export async function DELETE(request: NextRequest) {
  return NextResponse.json(
    { 
      error: 'Instructions feature not available',
      message: 'workspace_instructions table does not exist.'
    },
    { status: 501 }
  )
}
