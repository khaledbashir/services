/**
 * Parse uploaded files (xlsx / csv / txt / md / json / tsv) into AI-readable text.
 * Used by /api/proposed-cos/scope-it/stream so stakeholders can drop reference
 * documents into the scope generator and have them factored into the proposal.
 */

interface ParsedFile {
  filename: string
  mime: string
  size: number
  text: string
  truncated: boolean
}

const TEXT_MIMES = new Set([
  'text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values',
  'application/json', 'application/x-yaml', 'text/yaml',
])

const SPREADSHEET_EXT = new Set(['xlsx', 'xls', 'xlsm', 'xlsb', 'csv', 'tsv', 'ods'])

const MAX_TEXT_PER_FILE = 20_000 // chars — keeps prompt within model context

function ext(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : ''
}

async function parseSpreadsheet(buf: ArrayBuffer, filename: string): Promise<string> {
  const xlsx = await import('xlsx')
  const wb = xlsx.read(buf, { type: 'array' })
  const out: string[] = []
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName]
    const csv = xlsx.utils.sheet_to_csv(sheet, { strip: true })
    if (!csv.trim()) continue
    out.push(`## Sheet: ${sheetName}`)
    out.push(csv)
    out.push('')
  }
  return out.join('\n')
}

export async function parseUploadedFile(file: File): Promise<ParsedFile> {
  const filename = file.name || 'unnamed'
  const mime = file.type || ''
  const size = file.size
  const e = ext(filename)

  let text = ''
  try {
    if (SPREADSHEET_EXT.has(e)) {
      const buf = await file.arrayBuffer()
      text = await parseSpreadsheet(buf, filename)
    } else if (TEXT_MIMES.has(mime) || ['txt', 'md', 'json', 'yaml', 'yml', 'log'].includes(e)) {
      text = await file.text()
    } else {
      // Best-effort plain-text decode for anything else. PDFs without a parser
      // come through as binary garbage — the AI sees the gap and can ask the
      // user to paste content directly.
      text = `[Unparseable file type: ${mime || e || 'unknown'}. Filename: ${filename}, ${size} bytes. Paste relevant content directly into the description if you want it factored in.]`
    }
  } catch (err) {
    text = `[Failed to parse ${filename}: ${err instanceof Error ? err.message : String(err)}]`
  }

  const truncated = text.length > MAX_TEXT_PER_FILE
  if (truncated) {
    text = text.slice(0, MAX_TEXT_PER_FILE) + `\n\n[... truncated at ${MAX_TEXT_PER_FILE} chars; full file is ${text.length} chars ...]`
  }

  return { filename, mime, size, text, truncated }
}

export function formatFilesForPrompt(files: ParsedFile[]): string {
  if (!files.length) return ''
  const blocks = files.map((f) => `## Attached file: ${f.filename}${f.truncated ? ' (truncated)' : ''}\n\n${f.text}`)
  return '\n\n---\nStakeholder attached the following file(s) for context:\n\n' + blocks.join('\n\n---\n\n')
}
