// Tiny markdown → ProseMirror JSON converter for NocoDB documents.
//
// NocoDB uses TipTap (ProseMirror under the hood) for its document editor.
// The wire format is `{ type: 'doc', content: [<node>...] }` where each
// node is something like:
//   { type: 'heading', attrs: { level: 1 }, content: [{ type:'text', text:'…' }] }
//   { type: 'paragraph', content: [{ type:'text', text:'…' }] }
//   { type: 'bulletList', content: [{ type:'listItem', content: [<para>] }, ...] }
//   { type: 'codeBlock', content: [{ type:'text', text:'…' }] }
//
// We don't pull in a heavy markdown parser (markdown-it / micromark) because
// the AI's output is mostly headings + paragraphs + bullet lists + code +
// **bold** / *italic* — the long tail (tables, footnotes, html embeds)
// either survives as plain text or can be added later. Anything we can't
// parse becomes a paragraph with the raw text — never lossy.

interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: Array<{ type: string }>
}

function inlineParse(line: string): PMNode[] {
  const out: PMNode[] = []
  // Token-walk: **bold**, *italic*, `code`, plain text.
  // Greedy outer-first so **bold *with italic***  doesn't break.
  const re = /(\*\*([^*]+?)\*\*|\*([^*]+?)\*|`([^`]+?)`)/g
  let cur = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(line)) !== null) {
    if (m.index > cur) out.push({ type: 'text', text: line.slice(cur, m.index) })
    if (m[2] != null) out.push({ type: 'text', text: m[2], marks: [{ type: 'bold' }] })
    else if (m[3] != null) out.push({ type: 'text', text: m[3], marks: [{ type: 'italic' }] })
    else if (m[4] != null) out.push({ type: 'text', text: m[4], marks: [{ type: 'code' }] })
    cur = m.index + m[0].length
  }
  if (cur < line.length) out.push({ type: 'text', text: line.slice(cur) })
  return out.length > 0 ? out : [{ type: 'text', text: line }]
}

export function markdownToProseMirror(md: string): PMNode {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const content: PMNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    // Blank line — skip
    if (!trimmed) { i++; continue }

    // Heading
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headingMatch) {
      content.push({
        type: 'heading',
        attrs: { level: headingMatch[1].length },
        content: inlineParse(headingMatch[2]),
      })
      i++
      continue
    }

    // Code fence
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || null
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      content.push({
        type: 'codeBlock',
        attrs: lang ? { language: lang } : {},
        content: [{ type: 'text', text: codeLines.join('\n') }],
      })
      i++ // skip the closing ```
      continue
    }

    // Bullet list — accumulate consecutive `- ` / `* ` / `+ ` lines
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: PMNode[] = []
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^[-*+]\s+/, '')
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: inlineParse(itemText) }],
        })
        i++
      }
      content.push({ type: 'bulletList', content: items })
      continue
    }

    // Ordered list — `1. ` etc.
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: PMNode[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        const itemText = lines[i].trim().replace(/^\d+\.\s+/, '')
        items.push({
          type: 'listItem',
          content: [{ type: 'paragraph', content: inlineParse(itemText) }],
        })
        i++
      }
      content.push({ type: 'orderedList', content: items })
      continue
    }

    // Paragraph — accumulate consecutive non-special lines into one
    const paraLines: string[] = [trimmed]
    i++
    while (i < lines.length) {
      const next = lines[i].trim()
      if (!next || /^(#{1,6}\s|[-*+]\s|\d+\.\s|```)/.test(next)) break
      paraLines.push(next)
      i++
    }
    content.push({ type: 'paragraph', content: inlineParse(paraLines.join(' ')) })
  }

  return { type: 'doc', content }
}
