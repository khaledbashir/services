// Shared validator for ticket attachments. Used by both the create-ticket
// POST (`image` field for the cover attachment) and the attachments endpoint
// on an existing ticket. Despite the historical column name `image_url`, the
// store now holds any data URL — image, video, PDF, or common docs.

const MAX_DATA_URL_LENGTH = 30_000_000 // ~22 MB raw after base64 overhead

const ALLOWED_PREFIXES = [
  'image/',
  'video/',
  'audio/',
]

const ALLOWED_EXACT = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/x-zip-compressed',
])

function isAllowedMime(mime: string): boolean {
  if (ALLOWED_PREFIXES.some(p => mime.startsWith(p))) return true
  return ALLOWED_EXACT.has(mime)
}

export interface NormalizedAttachment {
  imageUrl: string  // keeps DB-column name; actually a data URL of any type
  mimeType: string
  filename: string | null
}

export function normalizeAttachment(input: any): NormalizedAttachment | null {
  if (!input?.data || typeof input.data !== 'string') return null

  let mimeType = typeof input.mimeType === 'string' ? input.mimeType : ''
  let dataUrl: string

  if (input.data.startsWith('data:')) {
    dataUrl = input.data
    const m = dataUrl.match(/^data:([^;,]+)[;,]/)
    if (m) mimeType = m[1] || mimeType
  } else {
    if (!mimeType) mimeType = 'application/octet-stream'
    dataUrl = `data:${mimeType};base64,${input.data}`
  }

  if (!isAllowedMime(mimeType)) return null
  if (dataUrl.length > MAX_DATA_URL_LENGTH) return null

  return {
    imageUrl: dataUrl,
    mimeType,
    filename: typeof input.name === 'string' ? input.name.slice(0, 180) : null,
  }
}

export const ATTACHMENT_ACCEPT = 'image/*,video/*,audio/*,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain,text/csv,.zip'

export const MAX_ATTACHMENT_BYTES = MAX_DATA_URL_LENGTH
