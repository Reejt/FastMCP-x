'use client'

import { useEffect, useRef, useState } from 'react'

interface MermaidDiagramProps {
  chart: string
  className?: string
}

// Generate unique ID for each diagram instance
let mermaidIdCounter = 0
const generateMermaidId = () => `mermaid_diagram_${++mermaidIdCounter}_${Date.now()}`

export default function MermaidDiagram({ chart, className = '' }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svg, setSvg] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true
    
    const renderDiagram = async () => {
      if (!chart) {
        setError('Empty diagram')
        setIsLoading(false)
        return
      }

      // Generate fresh ID for EACH render attempt to avoid conflicts
      const diagramId = generateMermaidId()

      try {
        // Dynamically import mermaid to avoid SSR issues
        const mermaid = (await import('mermaid')).default
        
        // Initialize mermaid (safe to call multiple times)
        mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: 'inherit',
          flowchart: {
            htmlLabels: true,
            curve: 'basis',
          },
        })

        // Clean the chart string - remove any extra backticks or mermaid markers
        let cleanChart = chart.trim()
        
        // Remove markdown code block markers if present (handle multiple levels)
        while (cleanChart.startsWith('```mermaid')) {
          cleanChart = cleanChart.slice(10).trim()
        }
        while (cleanChart.startsWith('```')) {
          cleanChart = cleanChart.slice(3).trim()
        }
        while (cleanChart.endsWith('```')) {
          cleanChart = cleanChart.slice(0, -3).trim()
        }
        
        // Final trim
        cleanChart = cleanChart.trim()

        // Skip empty charts
        if (!cleanChart) {
          if (isMounted) {
            setError('Empty diagram')
            setIsLoading(false)
          }
          return
        }

        // Render the diagram with fresh unique ID
        const { svg: renderedSvg } = await mermaid.render(diagramId, cleanChart)
        
        if (isMounted) {
          setSvg(renderedSvg)
          setIsLoading(false)
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err)
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to render diagram')
          setIsLoading(false)
        }
      }
    }

    renderDiagram()
    
    return () => {
      isMounted = false
    }
  }, [chart])

  if (isLoading) {
    return (
      <div className={`flex items-center justify-center p-8 bg-gray-50 rounded-lg ${className}`}>
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>Rendering diagram...</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`p-4 bg-red-50 border border-red-200 rounded-lg ${className}`}>
        <div className="flex items-start gap-2">
          <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-800">Failed to render diagram</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
            <details className="mt-2">
              <summary className="text-xs text-red-600 cursor-pointer hover:text-red-700">View source</summary>
              <pre className="mt-2 text-xs bg-red-100 p-2 rounded overflow-x-auto whitespace-pre-wrap font-mono">
                {chart.substring(0, 500)}{chart.length > 500 ? '...' : ''}
              </pre>
            </details>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className={`mermaid-diagram overflow-x-auto bg-white rounded-lg border border-gray-200 p-4 ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
