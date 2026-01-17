# Copilot Task: ChatGPT-Style Markdown Renderer in Next.js

## Objective

Style the existing LLM Markdown output renderer in a Next.js project to visually match ChatGPT’s chat response formatting.

## Context

- The app already uses `react-markdown` with `remark-gfm` to render Markdown.
- Output is clean Markdown from an LLM (headings, lists, code blocks, tables, etc.).
- Functionality works — only the **styling/typography** needs to be updated.

## Requirements

### Base Text

- Use a modern sans-serif font for default body text:
  - Font stack: `Inter`, `system-ui`, `Segoe UI`, `sans-serif`

### Headings

- Style `h1`, `h2`, `h3` with:
  - Consistent spacing above/below
  - Font weight: bold
  - Sizes:
    - `h1`: 1.875rem (`text-3xl`)
    - `h2`: 1.5rem (`text-2xl`)
    - `h3`: 1.25rem (`text-xl`)
  - Tailwind example:
    ```html
    <h2 className="text-2xl font-bold mt-6 mb-2" />
    ```

### Paragraphs

- Comfortable line height (`leading-relaxed`)
- Margins between paragraphs (`mb-4`)
- Tailwind suggestion: use `prose` class with `max-w-none`

### Lists

- Proper indentation and spacing
- Bullet points and numbers styled cleanly
- List items: `ml-6 list-disc space-y-1` or use `prose-ul`

### Code Blocks

- Monospaced font: `Menlo`, `SFMono-Regular`, or `Fira Code`
- Background: light gray (light mode), dark gray (dark mode)
- Padding: `px-4 py-3`
- Rounded corners: `rounded-md`
- Syntax highlighting with `Prism.js`, `shiki`, or `highlight.js`

### Inline Code

- Use `bg-muted px-1 py-0.5 text-sm font-mono rounded`

### Tables

- Styled with borders, spacing, and alternating row colors
- Must be horizontally scrollable on small screens:
  ```html
  <div className="overflow-x-auto">
    <table className="min-w-full border text-sm" />
  </div>
