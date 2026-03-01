# Clickable Citation Appendix Links

## Overview

The citation appendix that appears below LLM responses currently renders as plain text bullet points. This document describes how to make each citation entry a **blue, clickable link** that navigates to the relevant file in the Vault.

---

## Current Behavior

After a document-grounded query, the backend appends a **Sources** block to the LLM response:

```
---
**Sources:**
• report.pdf | Page 3 | Lines 41-60 | (88% relevant)
• notes.docx | Lines 1-20 | (74% relevant)
```

These lines render as plain text paragraphs via `ReactMarkdown` in `MarkdownRenderer.tsx`.

---

## Target Behavior

Each citation bullet becomes a blue, underlined, clickable link styled consistently with the existing `a` component in `MarkdownRenderer.tsx`:

```
---
**Sources:**
• [report.pdf | Page 3 | Lines 41-60 | (88% relevant)](/vault?highlight=report.pdf)
• [notes.docx | Lines 1-20 | (74% relevant)](/vault?highlight=notes.docx)
```

Clicking navigates to `/vault` with the filename pre-filled in the search/highlight param.

---

## Implementation

### 1. Backend — `server/query_handler.py`

Locate the `build_citations_section` inner function inside `query_with_context` (~line 770).

**Change the citation line format from plain text to a Markdown link:**

```python
# BEFORE
citation_lines.append(" | ".join(parts))

# AFTER
label = " | ".join(parts)          # e.g. "• report.pdf | Page 3 | (88% relevant)"
file_name_encoded = file_name.replace(" ", "%20")
citation_lines.append(f"[{label}](/vault?highlight={file_name_encoded})")
```

> **Why `/vault?highlight=`?**  
> The Vault page already exists at `/vault`. Passing `highlight=<filename>` as a query param lets the Vault page auto-scroll to and highlight that file. See [Step 3](#3-frontend--vaultpagetsx) for the Vault-side handling.

Full updated function:

```python
def build_citations_section(citations_list):
    """Format verified citations as clickable Markdown links."""
    if not citations_list:
        return ""

    unique_sources = {}
    for citation_info in citations_list:
        file_name = citation_info.get('file_name', 'Unknown')
        if file_name not in unique_sources:
            unique_sources[file_name] = citation_info
        else:
            if citation_info.get('similarity_score', 0) > unique_sources[file_name].get('similarity_score', 0):
                unique_sources[file_name] = citation_info

    citation_lines = ["---\n**Sources:**"]
    for file_name, citation_info in sorted(unique_sources.items()):
        parts = [f"• {file_name}"]

        if citation_info.get('page_number'):
            parts.append(f"Page {citation_info['page_number']}")
        if citation_info.get('line_number') is not None:
            parts.append(f"Line {citation_info['line_number']}")
        elif citation_info.get('line_range'):
            parts.append(f"Lines {citation_info['line_range']}")
        if citation_info.get('section_title'):
            section = citation_info['section_title']
            if citation_info.get('subsection_title'):
                section += f" → {citation_info['subsection_title']}"
            parts.append(section)

        score = citation_info.get('similarity_score', 0)
        if score:
            parts.append(f"({int(score * 100)}% relevant)")

        label = " | ".join(parts)
        file_name_encoded = file_name.replace(" ", "%20")
        citation_lines.append(f"[{label}](/vault?highlight={file_name_encoded})")

    return "\n".join(citation_lines)
```

---

### 2. Frontend — `MarkdownRenderer.tsx`

**No changes required.**

The existing `a` component renderer already applies blue link styling:

```tsx
// frontend/app/components/UI/MarkdownRenderer.tsx  (~line 152)
a: ({ children, href }) => (
  <a
    href={href}
    className="underline underline-offset-2"
    style={{ color: 'var(--markdown-link)' }}
    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--markdown-link-hover)'}
    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--markdown-link)'}
    target="_blank"
    rel="noopener noreferrer"
  >
    {children}
  </a>
),
```

> **One small adjustment:** Citation links point to `/vault` (same origin), so `target="_blank"` will open a new tab. If you prefer same-tab navigation, add a condition:
>
> ```tsx
> a: ({ children, href }) => {
>   const isInternal = href?.startsWith('/')
>   return (
>     <a
>       href={href}
>       className="underline underline-offset-2"
>       style={{ color: 'var(--markdown-link)' }}
>       onMouseEnter={(e) => e.currentTarget.style.color = 'var(--markdown-link-hover)'}
>       onMouseLeave={(e) => e.currentTarget.style.color = 'var(--markdown-link)'}
>       target={isInternal ? '_self' : '_blank'}
>       rel={isInternal ? undefined : 'noopener noreferrer'}
>     >
>       {children}
>     </a>
>   )
> },
> ```

---

### 3. Frontend — `frontend/app/vault/page.tsx`

Add support for the `highlight` query param so the Vault page auto-scrolls to and highlights the referenced file.

**Add to the top of `VaultPage` component:**

```tsx
const searchParams = useSearchParams()

useEffect(() => {
  const highlight = searchParams.get('highlight')
  if (highlight && uploadedFiles.length > 0) {
    // Find the file by name
    const match = uploadedFiles.find(f =>
      f.name.toLowerCase() === decodeURIComponent(highlight).toLowerCase()
    )
    if (match) {
      // Set search query to surface it immediately
      setSearchQuery(decodeURIComponent(highlight))
      // Scroll to the element after render
      setTimeout(() => {
        const el = document.getElementById(`vault-file-${match.id}`)
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 300)
    }
  }
}, [searchParams, uploadedFiles])
```

**Add `id` attribute to each file row/card** so scroll targeting works:

```tsx
// List view row
<div
  id={`vault-file-${file.id}`}
  key={file.id}
  className="..."
  ...
>

// Grid view card
<div
  id={`vault-file-${file.id}`}
  key={file.id}
  className="..."
  ...
>
```

> **Import required:** Add `useSearchParams` to the existing next/navigation import at the top of `vault/page.tsx`.

---

## CSS Variables Used

| Variable | Purpose |
|---|---|
| `--markdown-link` | Default blue colour for citation link text |
| `--markdown-link-hover` | Hover colour (slightly darker blue) |

These are already defined in the global theme stylesheet. No new CSS variables needed.

---

## Files to Modify

| File | Change |
|---|---|
| `server/query_handler.py` | Output citation labels as Markdown link syntax |
| `frontend/app/components/UI/MarkdownRenderer.tsx` | Optional: distinguish internal vs external links |
| `frontend/app/vault/page.tsx` | Handle `?highlight=` param; add `id` to file rows |

---

## Result

Before:
> • report.pdf | Page 3 | Lines 41-60 | (88% relevant)

After:
> [• report.pdf | Page 3 | Lines 41-60 | (88% relevant)](/vault?highlight=report.pdf) ← **blue, underlined, clickable**
