/**
 * Plain-text extraction from .docx / .txt / .md uploads.
 *
 * A .docx is a ZIP holding `word/document.xml`. Rather than pull in a parser
 * dependency for one file, the central directory is walked directly and the
 * entry is inflated with node:zlib. Stored (uncompressed) entries are handled
 * too — small documents are sometimes written that way.
 */
import { inflateRawSync } from 'zlib'

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50

type ZipEntry = { name: string; method: number; offset: number; compressedSize: number }

function findEndOfCentralDirectory(buf: Buffer): number {
  // The comment field can be up to 64 KB, so scan backwards from the tail.
  const start = Math.max(0, buf.length - 66_000)
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i
  }
  return -1
}

function listEntries(buf: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(buf)
  if (eocd < 0) throw new Error('Not a valid .docx (no zip directory found)')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  const entries: ZipEntry[] = []
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== CEN_SIG) break
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const offset = buf.readUInt32LE(p + 42)
    entries.push({
      name: buf.toString('utf8', p + 46, p + 46 + nameLen),
      method, offset, compressedSize,
    })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

function readEntry(buf: Buffer, entry: ZipEntry): Buffer {
  // Local header: name/extra lengths differ from the central copy, so re-read them.
  const nameLen = buf.readUInt16LE(entry.offset + 26)
  const extraLen = buf.readUInt16LE(entry.offset + 28)
  const start = entry.offset + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + entry.compressedSize)
  return entry.method === 0 ? Buffer.from(raw) : inflateRawSync(raw)
}

/** Turn WordprocessingML into readable plain text, one line per paragraph. */
export function docxXmlToText(xml: string): string {
  return xml
    .replace(/<w:tab\b[^>]*\/>/g, '\t')
    .replace(/<w:br\b[^>]*\/>/g, '\n')
    // Paragraph and table-row ends are the only real line breaks in the markup.
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/w:tr>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractDocxText(buffer: Buffer): string {
  const entries = listEntries(buffer)
  const doc = entries.find(e => e.name === 'word/document.xml')
  if (!doc) throw new Error('Not a Word document (word/document.xml missing)')
  return docxXmlToText(readEntry(buffer, doc).toString('utf8'))
}

/** Route any supported upload to plain text. Throws with a readable message. */
export function extractUploadText(filename: string, buffer: Buffer): string {
  const name = (filename || '').toLowerCase()
  if (name.endsWith('.docx')) return extractDocxText(buffer)
  if (name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.rtf') || !name.includes('.')) {
    return buffer.toString('utf8').replace(/\r\n/g, '\n').trim()
  }
  if (name.endsWith('.doc')) {
    throw new Error('Legacy .doc files are not supported — save as .docx, or paste the text in.')
  }
  if (name.endsWith('.pdf')) {
    throw new Error('PDFs are not supported yet — paste the text in instead.')
  }
  throw new Error(`Unsupported file type. Upload a .docx or .txt, or paste the text in.`)
}
