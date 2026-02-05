import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer'
import { v4 as uuidv4 } from 'uuid'

export async function POST(request: NextRequest) {
  let browser = null

  try {
    const { mermaidCode, format, options = {} } = await request.json()

    if (!mermaidCode || !format) {
      return NextResponse.json(
        { error: 'Missing required fields: mermaidCode and format' },
        { status: 400 }
      )
    }

    // Validate format
    const supportedFormats = ['png', 'svg', 'pdf']
    if (!supportedFormats.includes(format)) {
      return NextResponse.json(
        { error: `Unsupported format. Supported: ${supportedFormats.join(', ')}` },
        { status: 400 }
      )
    }

    // Generate unique filename
    const fileId = uuidv4()
    const filename = `diagram_${fileId}.${format}`

    // Launch browser for rendering
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    })

    const page = await browser.newPage()

    // Create HTML with Mermaid diagram
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <script src="https://cdn.jsdelivr.net/npm/mermaid@10.6.1/dist/mermaid.min.js"></script>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: Arial, sans-serif;
            }
            .mermaid {
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 400px;
            }
          </style>
        </head>
        <body>
          <div class="mermaid">
            ${mermaidCode}
          </div>
          <script>
            mermaid.initialize({
              startOnLoad: true,
              theme: 'default',
              securityLevel: 'loose'
            });
          </script>
        </body>
      </html>
    `

    // Set content and wait for rendering
    await page.setContent(html)
    await page.waitForSelector('.mermaid svg', { timeout: 10000 })

    let buffer: Buffer | Uint8Array

    if (format === 'png') {
      // Get diagram dimensions
      const svgElement = await page.$('.mermaid svg')
      let boundingBox = null

      if (svgElement) {
        boundingBox = await svgElement.boundingBox()
      }

      const viewport = {
        width: Math.ceil((boundingBox?.width || 800) + 40),
        height: Math.ceil((boundingBox?.height || 600) + 40)
      }

      await page.setViewport(viewport)

      // Take screenshot
      buffer = await page.screenshot({
        type: 'png',
        fullPage: false,
        clip: {
          x: 0,
          y: 0,
          width: viewport.width,
          height: viewport.height
        }
      })
    } else if (format === 'svg') {
      // Extract SVG content
      const svgElement = await page.$('.mermaid svg')

      if (!svgElement) {
        throw new Error('SVG element not found')
      }

      const svgContent: string = await page.$eval('.mermaid svg', (svg) => {
        // Add XML declaration and clean up
        const serializer = new XMLSerializer()
        let svgString = serializer.serializeToString(svg)

        // Add proper XML declaration
        svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgString

        return svgString
      })

      buffer = Buffer.from(svgContent, 'utf-8')
    } else if (format === 'pdf') {
      // Generate PDF
      buffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: {
          top: '20px',
          right: '20px',
          bottom: '20px',
          left: '20px'
        }
      })
    } else {
      throw new Error(`Unsupported format: ${format}`)
    }

    // Close browser
    await browser.close()
    browser = null

    // Return file as download
    const response = new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': format === 'png' ? 'image/png' :
                       format === 'svg' ? 'image/svg+xml' :
                       'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buffer.length.toString(),
        'Cache-Control': 'no-cache'
      }
    })

    return response

  } catch (error) {
    console.error('Diagram export error:', error)

    // Close browser if still open
    if (browser) {
      try {
        await browser.close()
      } catch (closeError) {
        console.error('Error closing browser:', closeError)
      }
    }

    return NextResponse.json(
      { error: 'Failed to export diagram' },
      { status: 500 }
    )
  }
}