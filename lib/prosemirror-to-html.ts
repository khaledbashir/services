// ProseMirror JSON → HTML converter for NocoDB documents.
//
// Mirrors the reverse direction of lib/prosemirror-from-markdown.ts so we
// can take what NocoDB's TipTap editor stored and feed it to Browserless
// for PDF rendering. Same scope: heading / paragraph / bulletList /
// orderedList / listItem / codeBlock / hardBreak, and inline marks
// bold / italic / code / strike / underline / link.
//
// Anything we don't recognize is rendered as its raw text (lossless), and
// containers we don't model render their children inside a <div>. Better
// to ship "all the words" than fail loudly.

interface PMMark { type: string; attrs?: Record<string, unknown> }
interface PMNode {
  type: string
  attrs?: Record<string, unknown>
  content?: PMNode[]
  text?: string
  marks?: PMMark[]
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderText(node: PMNode): string {
  let out = escape(node.text || '')
  for (const mark of node.marks || []) {
    switch (mark.type) {
      case 'bold':
      case 'strong':
        out = `<strong>${out}</strong>`
        break
      case 'italic':
      case 'em':
        out = `<em>${out}</em>`
        break
      case 'code':
        out = `<code>${out}</code>`
        break
      case 'strike':
      case 'strikethrough':
        out = `<s>${out}</s>`
        break
      case 'underline':
        out = `<u>${out}</u>`
        break
      case 'link': {
        const href = String(mark.attrs?.href || '#')
        out = `<a href="${escape(href)}">${out}</a>`
        break
      }
    }
  }
  return out
}

function renderNode(node: PMNode): string {
  if (!node) return ''
  if (node.type === 'text') return renderText(node)

  const inner = (node.content || []).map(renderNode).join('')
  switch (node.type) {
    case 'doc':
      return inner
    case 'paragraph':
      return `<p>${inner}</p>`
    case 'heading': {
      const level = Math.max(1, Math.min(6, Number(node.attrs?.level) || 1))
      return `<h${level}>${inner}</h${level}>`
    }
    case 'bulletList':
    case 'bullet_list':
      return `<ul>${inner}</ul>`
    case 'orderedList':
    case 'ordered_list':
      return `<ol>${inner}</ol>`
    case 'listItem':
    case 'list_item':
      return `<li>${inner}</li>`
    case 'codeBlock':
    case 'code_block': {
      const lang = node.attrs?.language ? ` class="language-${escape(String(node.attrs.language))}"` : ''
      return `<pre><code${lang}>${inner}</code></pre>`
    }
    case 'blockquote':
      return `<blockquote>${inner}</blockquote>`
    case 'hardBreak':
    case 'hard_break':
      return '<br/>'
    case 'horizontalRule':
    case 'horizontal_rule':
      return '<hr/>'
    case 'image': {
      const src = escape(String(node.attrs?.src || ''))
      const alt = escape(String(node.attrs?.alt || ''))
      return `<img src="${src}" alt="${alt}"/>`
    }
    case 'table':
      return `<table>${inner}</table>`
    case 'tableRow':
    case 'table_row':
      return `<tr>${inner}</tr>`
    case 'tableHeader':
    case 'table_header':
      return `<th>${inner}</th>`
    case 'tableCell':
    case 'table_cell':
      return `<td>${inner}</td>`
    default:
      // Unknown node — render children inside a div so we don't lose content.
      return inner ? `<div data-pm-type="${escape(node.type)}">${inner}</div>` : ''
  }
}

export function proseMirrorToHTML(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  return renderNode(doc as PMNode)
}

// Wrap the body HTML in a print-ready document. Includes minimal styling so
// the PDF doesn't look like a 1990s Word export — a single sans-serif stack,
// readable line height, table borders, code-block grey background.
export function wrapPrintHTML(opts: {
  title: string
  bodyHTML: string
}): string {
  const title = (opts.title || 'Untitled').slice(0, 200)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>${escape(title)}</title>
<style>
  @page { size: Letter; margin: 0.75in; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    font-size: 11pt;
    line-height: 1.55;
    color: #111;
  }
  h1 { font-size: 22pt; margin: 0 0 12pt; line-height: 1.2; }
  h2 { font-size: 17pt; margin: 18pt 0 8pt; }
  h3 { font-size: 13pt; margin: 14pt 0 6pt; }
  h4, h5, h6 { font-size: 11pt; margin: 10pt 0 4pt; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 10pt 24pt; padding: 0; }
  li { margin: 0 0 3pt; }
  pre { background: #f4f4f5; padding: 8pt 10pt; border-radius: 4pt; overflow-x: auto; font-size: 9.5pt; }
  code { background: #f4f4f5; padding: 1pt 4pt; border-radius: 3pt; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 9.5pt; }
  pre code { background: transparent; padding: 0; }
  blockquote { border-left: 3px solid #d4d4d8; margin: 0 0 10pt; padding: 2pt 12pt; color: #52525b; }
  a { color: #0A52EF; text-decoration: none; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 10pt; }
  th, td { border: 1px solid #e4e4e7; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; font-weight: 600; }
  hr { border: 0; border-top: 1px solid #e4e4e7; margin: 14pt 0; }
  img { max-width: 100%; }
  .doc-header { border-bottom: 1px solid #e4e4e7; margin-bottom: 18pt; padding-bottom: 10pt; }
  .doc-header h1 { margin: 0; }
</style>
</head>
<body>
<div class="doc-header"><h1>${escape(title)}</h1></div>
${opts.bodyHTML}
</body>
</html>`
}
