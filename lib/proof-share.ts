/**
 * Proof Share — public URL sharing for Twenty CRM proof files.
 *
 * Clients receive a URL like `https://services.anc.com/proof/<token>` that
 * renders a polished page with the attached files, client context, and
 * Approve / Request Changes buttons. No login required.
 *
 * Architecture:
 *   1. Designer uploads file to a Twenty record (Print Request, Design Request, etc.)
 *   2. Designer calls `POST /api/proof-share/create` — returns a public URL
 *   3. Client opens URL — `/proof/[token]` page fetches metadata + streams files through our proxy
 *   4. Client clicks Approve or Request Changes — writes back to Twenty + Slack-notifies the designer
 */

import crypto from 'node:crypto'

const TWENTY_BASE = process.env.TWENTY_API_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY || ''

// Supported Twenty object types and their config
export interface ObjectConfig {
  plural: string                   // REST endpoint: /rest/<plural>
  targetField: string              // Attachment filter: targetXxxId
  statusField: string              // Which field holds the status to update
  approvedValue: string            // Status value on client approval
  revisionsValue: string           // Status value on "request changes"
  displayLabel: string             // Human-readable label for UI
  clientFieldName?: string         // Field containing client/customer name
}

export const OBJECT_CONFIGS: Record<string, ObjectConfig> = {
  printRequest: {
    plural: 'printRequests',
    targetField: 'targetPrintRequestId',
    statusField: 'status',
    approvedValue: 'STATUS_APPROVED',
    revisionsValue: 'STATUS_AWAITING_APPROVAL',
    displayLabel: 'Print Request',
    clientFieldName: 'billTo',
  },
  designRequest: {
    plural: 'designRequests',
    targetField: 'targetDesignRequestId',
    statusField: 'status',
    approvedValue: 'STATUS_APPROVED',
    revisionsValue: 'STATUS_REVISIONS',
    displayLabel: 'Design Request',
    clientFieldName: 'clientTriCode',
  },
  cgDesignRequest: {
    plural: 'cgDesignRequests',
    targetField: 'targetCgDesignRequestId',
    statusField: 'status',
    approvedValue: 'STATUS_APPROVED',
    revisionsValue: 'STATUS_REVISIONS',
    displayLabel: 'CG Design Request',
    clientFieldName: 'clientTriCode',
  },
  contentSchedule: {
    plural: 'contentSchedules',
    targetField: 'targetContentScheduleId',
    statusField: 'status',
    approvedValue: 'STATUS_CONFIRMED',
    revisionsValue: 'STATUS_IN_QUEUE',
    displayLabel: 'Content Schedule',
    clientFieldName: 'clientTriCode',
  },
}

export interface TwentyAttachment {
  id: string
  name: string
  createdAt: string
  file: Array<{
    label: string
    fileId: string
    extension: string
    url: string
  }>
  fileCategory: string
}

export interface TwentyRecord {
  id: string
  name: string
  [key: string]: unknown
}

// --- Token generation ---

/**
 * Generate a cryptographically-random, URL-safe token for a proof share.
 */
export function generateToken(length = 24): string {
  return crypto
    .randomBytes(length)
    .toString('base64url')
}

// --- Twenty REST helpers ---

async function twentyFetch<T = unknown>(
  path: string,
  init?: RequestInit
): Promise<T> {
  if (!TWENTY_API_KEY) {
    throw new Error('TWENTY_API_KEY is not configured')
  }
  const res = await fetch(`${TWENTY_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Twenty ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json() as Promise<T>
}

/**
 * Fetch a Twenty record by object type + id.
 */
export async function fetchTwentyRecord(
  objectType: string,
  recordId: string
): Promise<TwentyRecord | null> {
  const cfg = OBJECT_CONFIGS[objectType]
  if (!cfg) throw new Error(`Unknown object type: ${objectType}`)
  const singular = objectType // Twenty REST returns { data: { [singular]: record } }
  try {
    const data = await twentyFetch<{ data: Record<string, TwentyRecord> }>(
      `/rest/${cfg.plural}/${recordId}`
    )
    return data.data?.[singular] ?? null
  } catch (err) {
    console.error(`[proof-share] fetchTwentyRecord failed:`, err)
    return null
  }
}

/**
 * Fetch all attachments attached to a given Twenty record. Twenty attachments
 * are polymorphic via `targetXxxId` — we filter by the correct field.
 */
export async function fetchAttachmentsForRecord(
  objectType: string,
  recordId: string
): Promise<TwentyAttachment[]> {
  const cfg = OBJECT_CONFIGS[objectType]
  if (!cfg) return []
  try {
    const data = await twentyFetch<{ data: { attachments: TwentyAttachment[] } }>(
      `/rest/attachments?filter=${cfg.targetField}[eq]:"${recordId}"&limit=60`
    )
    return data.data?.attachments ?? []
  } catch (err) {
    console.error(`[proof-share] fetchAttachments failed:`, err)
    return []
  }
}

/**
 * Fetch a single attachment by id. Used to re-fetch fresh file URLs (the
 * signed JWT in `file[0].url` expires after ~24 hours, so we refetch on every
 * client request to ensure a working URL).
 */
export async function fetchAttachmentById(
  attachmentId: string
): Promise<TwentyAttachment | null> {
  try {
    const data = await twentyFetch<{ data: { attachment: TwentyAttachment } }>(
      `/rest/attachments/${attachmentId}`
    )
    return data.data?.attachment ?? null
  } catch (err) {
    console.error(`[proof-share] fetchAttachmentById failed:`, err)
    return null
  }
}

/**
 * Update a Twenty record's status field (used when the client approves or
 * requests changes).
 */
export async function updateTwentyRecordStatus(
  objectType: string,
  recordId: string,
  statusValue: string
): Promise<boolean> {
  const cfg = OBJECT_CONFIGS[objectType]
  if (!cfg) return false
  try {
    await twentyFetch(
      `/rest/${cfg.plural}/${recordId}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ [cfg.statusField]: statusValue }),
      }
    )
    return true
  } catch (err) {
    console.error(`[proof-share] updateStatus failed:`, err)
    return false
  }
}

// --- File categorization for the client UI ---

export function classifyFile(extension: string): 'image' | 'video' | 'pdf' | 'other' {
  const ext = extension.toLowerCase().replace('.', '')
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v'].includes(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}

/**
 * Build the absolute public URL for a proof-share token (used when returning
 * the URL to the designer at create time).
 */
export function buildPublicUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://abc-anc-services.izcgmb.easypanel.host'
  return `${base.replace(/\/$/, '')}/proof/${token}`
}
