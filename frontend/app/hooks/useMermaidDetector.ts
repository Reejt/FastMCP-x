'use client'

import { useState, useEffect, useMemo } from 'react'

interface DiagramData {
  id: string
  type: string
  title: string
  mermaidCode: string
  svgRendered?: string
  createdAt: Date
  metadata?: {
    lines: number
    complexity: 'simple' | 'medium' | 'complex'
    estimatedRenderTime: number
  }
}

export function useMermaidDetector(
  messages: Array<{ content: string; role: string; id?: string }>,
  shouldDetect: boolean = false
) {
  const [detectedDiagrams, setDetectedDiagrams] = useState<DiagramData[]>([])
  const [currentDiagram, setCurrentDiagram] = useState<DiagramData | null>(null)

  useEffect(() => {
    if (!shouldDetect) {
      setDetectedDiagrams([])
      setCurrentDiagram(null)
      return
    }

    const diagrams: DiagramData[] = []

    messages.forEach((message) => {
      // ✅ Validate message structure before processing
      if (!message || message.role !== 'assistant' || typeof message.content !== 'string') {
        return
      }
      if (!message.id) {
        console.warn('Skipping message without ID')
        return
      }

      const content = message.content

      // Look for mermaid code blocks
      const mermaidRegex = /```mermaid\s*\n([\s\S]*?)\n```/g
      let match
      let blockIndex = 0

      while ((match = mermaidRegex.exec(content)) !== null) {
        const mermaidCode = match[1].trim()
        if (!mermaidCode) continue // Skip empty code blocks
        const lines = mermaidCode.split('\n').filter(line => line.trim())

        if (lines.length > 0) {
          // Determine diagram type from first line
          const firstLine = lines[0].toLowerCase()
          let type = 'unknown'

          if (firstLine.includes('flowchart')) type = 'flowchart'
          else if (firstLine.includes('sequencediagram') || firstLine.includes('sequence')) type = 'sequence'
          else if (firstLine.includes('gantt')) type = 'gantt'
          else if (firstLine.includes('pie')) type = 'pie'
          else if (firstLine.includes('bar')) type = 'bar'
          else if (firstLine.includes('classdiagram') || firstLine.includes('class')) type = 'class'
          else if (firstLine.includes('statediagram') || firstLine.includes('state')) type = 'state'
          else if (firstLine.includes('graph')) type = 'graph'

          // Estimate complexity
          let complexity: 'simple' | 'medium' | 'complex' = 'simple'
          if (lines.length > 20) complexity = 'complex'
          else if (lines.length > 10) complexity = 'medium'

          // ✅ Validate message has ID before creating diagram
          if (!message.id) {
            console.warn('Message missing ID, skipping diagram')
            continue
          }

          const diagram: DiagramData = {
            id: `msg_${message.id}_diagram_${blockIndex}`,
            type,
            title: `${type.charAt(0).toUpperCase() + type.slice(1)} Diagram`,
            mermaidCode,
            createdAt: new Date(),
            metadata: {
              lines: lines.length,
              complexity,
              estimatedRenderTime: Math.max(100, lines.length * 10) // Rough estimate
            }
          }

          diagrams.push(diagram)
          blockIndex++
        }
      }
    })

    setDetectedDiagrams((prev) => {
      // Only update if diagrams actually changed to prevent unnecessary re-renders
      if (prev.length === diagrams.length && 
          prev.every((d, i) => d.id === diagrams[i]?.id)) {
        return prev
      }
      return diagrams
    })

    // Only show the most recent diagram if detection is enabled
    if (diagrams.length > 0) {
      setCurrentDiagram((prev) => {
        const newest = diagrams[diagrams.length - 1]
        // Only update if the diagram actually changed
        if (prev?.id === newest.id) return prev
        return newest
      })
    } else {
      setCurrentDiagram(null)
    }
  }, [messages, shouldDetect])

  const showDiagram = (diagramId: string) => {
    const diagram = detectedDiagrams.find((d: DiagramData) => d.id === diagramId)
    if (diagram) {
      setCurrentDiagram(diagram)
    }
  }

  // ✅ Allow adding dynamic diagrams that weren't extracted from messages
  // Scoped function prevents external state mutations
  const addDynamicDiagram = (diagram: DiagramData | null) => {
    // ✅ Comprehensive validation with proper error handling
    if (!diagram) {
      console.warn('Attempted to add null diagram')
      return false
    }

    // Validate all required fields
    if (!diagram.id || typeof diagram.id !== 'string' || diagram.id.trim() === '') {
      console.warn('Invalid diagram ID:', diagram.id)
      return false
    }
    if (!diagram.mermaidCode || typeof diagram.mermaidCode !== 'string' || diagram.mermaidCode.trim() === '') {
      console.warn('Invalid diagram code:', diagram.mermaidCode)
      return false
    }
    if (!diagram.type || typeof diagram.type !== 'string') {
      console.warn('Invalid diagram type:', diagram.type)
      return false
    }

    // Check if diagram already exists to prevent duplicates
    if (detectedDiagrams.some((d: DiagramData) => d.id === diagram.id)) {
      console.warn('Diagram operation already in progress:', diagram.id)
      return false
    }

    // Add diagram to state
    setDetectedDiagrams((prev: DiagramData[]) => {
      // Check if diagram already exists to prevent duplicates
      const exists = prev.some((d: DiagramData) => d.id === diagram.id)
      if (exists) {
        console.warn('Diagram already exists:', diagram.id)
        return prev
      }
      return [...prev, diagram]
    })
    setCurrentDiagram(diagram)
    return true
  }

  const closeDiagram = () => {
    setCurrentDiagram(null)
  }

  return {
    currentDiagram,
    showDiagram,
    addDynamicDiagram,
    closeDiagram,
    hasDiagrams: detectedDiagrams.length > 0
  }
}