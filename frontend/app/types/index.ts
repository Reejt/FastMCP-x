export interface Message {
  id: string
  content: string
  role: 'user' | 'assistant'
  timestamp: Date
  isStreaming?: boolean
}

export interface Project {
  id: string
  name: string
  description?: string
  createdAt: Date
  updatedAt: Date
}

export interface VaultFile {
  id: string
  name: string
  type: string
  size: number
  uploadedAt: Date
  path: string
}

export interface Instruction {
  id: string
  title: string
  content: string
  createdAt: Date
}

export interface User {
  id: string
  email: string
  role: 'user' | 'admin'
  name?: string
}

export interface ChatSession {
  id: string
  projectId?: string
  messages: Message[]
  createdAt: Date
  updatedAt: Date
}
