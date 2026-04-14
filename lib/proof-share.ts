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

/**
 * Patch any fields on a Twenty record. Used to sync proof state
 * (proofShareUrl, proofViewCount, proofLastViewedAt, etc.) back to Twenty
 * so Alexis/designers see it on the record itself.
 */
export async function patchTwentyRecord(
  objectType: string,
  recordId: string,
  patch: Record<string, unknown>
): Promise<boolean> {
  const cfg = OBJECT_CONFIGS[objectType]
  if (!cfg) return false
  try {
    await twentyFetch(
      `/rest/${cfg.plural}/${recordId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    )
    return true
  } catch (err) {
    console.error(`[proof-share] patchTwentyRecord failed:`, err)
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

/**
 * Build the HTML body for a proof-ready email sent to a client.
 * Includes an inline thumbnail for image attachments, a big APPROVE and
 * REQUEST CHANGES button, and the designer's name/message.
 */
export function buildProofEmailHtml(opts: {
  recordName: string
  recordTypeLabel: string
  proofUrl: string
  message?: string | null
  designerName?: string | null
  expiresAt?: Date | null
  thumbnailUrl?: string | null
  isRenewal?: boolean
}): string {
  const {
    recordName,
    recordTypeLabel,
    proofUrl,
    message,
    designerName,
    expiresAt,
    thumbnailUrl,
    isRenewal,
  } = opts
  const heading = isRenewal
    ? `New version ready — ${recordName}`
    : `Your proof is ready — ${recordName}`
  const subHeading = isRenewal
    ? `A new version has been uploaded. Any previous link is no longer current.`
    : `Review and respond below.`
  const deadlineLine = expiresAt
    ? `<p style="margin:12px 0 0;font-size:12px;color:#777">This link expires on ${expiresAt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}.</p>`
    : ''
  const messageBlock = message
    ? `<div style="background:#F7F7F9;border-left:3px solid #002C73;padding:12px 14px;margin:16px 0;border-radius:4px;font-size:14px;color:#333">${escapeHtml(message)}</div>`
    : ''
  const designerLine = designerName
    ? `<p style="margin:0 0 8px;font-size:13px;color:#777">from ${escapeHtml(designerName)}</p>`
    : ''
  const thumbBlock = thumbnailUrl
    ? `<div style="text-align:center;margin:20px 0"><a href="${proofUrl}" style="text-decoration:none"><img src="${thumbnailUrl}" alt="Proof preview" style="max-width:100%;max-height:320px;border-radius:6px;border:1px solid #E5E5E8"/></a></div>`
    : ''
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:0 16px">
    <div style="background:#002C73;color:#fff;padding:22px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:18px;line-height:1.3">${escapeHtml(heading)}</h2>
      <p style="margin:6px 0 0;opacity:0.8;font-size:13px">${escapeHtml(recordTypeLabel)}</p>
    </div>
    <div style="background:#fff;padding:22px 24px;border:1px solid #E5E5E8;border-top:none;border-radius:0 0 8px 8px">
      ${designerLine}
      <p style="margin:0 0 6px;font-size:15px;color:#111">${escapeHtml(subHeading)}</p>
      ${messageBlock}
      ${thumbBlock}
      <table style="width:100%;border-collapse:collapse;margin-top:8px">
        <tr>
          <td style="padding-right:6px">
            <a href="${proofUrl}?action=approve" style="display:block;text-align:center;background:#16A34A;color:#fff;text-decoration:none;padding:14px 18px;border-radius:6px;font-weight:600;font-size:15px">✓ Approve</a>
          </td>
          <td style="padding-left:6px">
            <a href="${proofUrl}?action=changes" style="display:block;text-align:center;background:#fff;color:#111;border:1px solid #D4D4D8;text-decoration:none;padding:14px 18px;border-radius:6px;font-weight:600;font-size:15px">✎ Request Changes</a>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:13px;color:#555">
        Or open the full proof: <a href="${proofUrl}" style="color:#002C73">${proofUrl}</a>
      </p>
      ${deadlineLine}
    </div>
    <p style="margin:16px 0;text-align:center;font-size:11px;color:#999">Sent by ANC Sports · This is a secure client link, do not forward.</p>
  </div>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;'
  )
}

/**
 * Send the proof-ready email to the client with a thumbnail and action buttons.
 * Uses the first image attachment (if any) as the inline thumbnail, served
 * through our file proxy so the JWT stays fresh.
 */
export async function sendProofEmailToClient(opts: {
  token: string
  clientEmail: string
  recordName: string
  recordTypeLabel: string
  message?: string | null
  designerName?: string | null
  designerEmail?: string | null
  expiresAt?: Date | null
  attachments?: TwentyAttachment[]
  isRenewal?: boolean
}): Promise<boolean> {
  const { sendEmail } = await import('./email')
  const proofUrl = buildPublicUrl(opts.token)
  const base =
    process.env.NEXT_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://abc-anc-services.izcgmb.easypanel.host'
  // Pick the first image as a preview thumbnail (video/pdf fall through)
  const firstImage = opts.attachments?.find((a) =>
    classifyFile(a.file?.[0]?.extension || '') === 'image'
  )
  const thumbnailUrl = firstImage
    ? `${base.replace(/\/$/, '')}/api/proof-share/${opts.token}/file/${firstImage.id}`
    : null
  const html = buildProofEmailHtml({
    recordName: opts.recordName,
    recordTypeLabel: opts.recordTypeLabel,
    proofUrl,
    message: opts.message,
    designerName: opts.designerName,
    expiresAt: opts.expiresAt,
    thumbnailUrl,
    isRenewal: opts.isRenewal,
  })
  const subject = opts.isRenewal
    ? `New version: ${opts.recordName}`
    : `Ready for your review: ${opts.recordName}`
  return sendEmail([opts.clientEmail], subject, html, opts.designerEmail || undefined)
}
