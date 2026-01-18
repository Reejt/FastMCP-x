'use client'

import { create } from 'zustand'
import { Workspace } from '@/app/types'

interface WorkspacesStore {
  workspaces: Workspace[]
  loading: boolean
  setWorkspaces: (workspaces: Workspace[]) => void
  setLoading: (loading: boolean) => void
  loadWorkspaces: () => Promise<void>
  updateWorkspace: (workspaceId: string, updates: Partial<Workspace>) => void
  removeWorkspace: (workspaceId: string) => void
  addWorkspace: (workspace: Workspace) => void
}

export const useWorkspacesStore = create<WorkspacesStore>((set, get) => ({
  workspaces: [],
  loading: true,
  
  setWorkspaces: (workspaces) => set({ workspaces }),
  
  setLoading: (loading) => set({ loading }),
  
  loadWorkspaces: async () => {
    try {
      const response = await fetch('/api/workspaces')
      const data = await response.json()

      if (data.success && data.workspaces) {
        set({ workspaces: data.workspaces, loading: false })
      }
    } catch (error) {
      console.error('Error loading workspaces:', error)
      set({ loading: false })
    }
  },
  
  updateWorkspace: (workspaceId, updates) => {
    set((state) => ({
      workspaces: state.workspaces.map((w) =>
        w.id === workspaceId ? { ...w, ...updates } : w
      ),
    }))
  },
  
  removeWorkspace: (workspaceId) => {
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
    }))
  },
  
  addWorkspace: (workspace) => {
    set((state) => ({
      workspaces: [...state.workspaces, workspace],
    }))
  },
}))

