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
export function getPublicBaseUrl(): string {
  const configured =
    process.env.NEXT_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'https://services.ancsports.net'
  return configured.replace(/\/$/, '')
}

export function buildPublicUrl(token: string): string {
  return `${getPublicBaseUrl()}/proof/${token}`
}

/**
 * Build the HTML body for a proof-ready email sent to a client.
 * Returns a complete, self-contained HTML document so any email client
 * (and any forwarding path that strips wrappers) renders it correctly
 * instead of showing raw tags.
 */
export function buildProofEmailHtml(opts: {
  recordName: string
  recordTypeLabel?: string
  proofUrl: string
  message?: string | null
  designerName?: string | null
  expiresAt?: Date | null
  thumbnailUrl?: string | null
  isRenewal?: boolean
}): string {
  const { recordName, proofUrl, expiresAt } = opts
  const expiresLine = expiresAt
    ? `This link expires on ${expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.`
    : 'This link expires in 30 days.'
  const safeName = escapeHtml(recordName)
  const safeUrl = escapeHtml(proofUrl)
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeName}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#111;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
<tr><td style="padding:0 0 24px 0;">
  <div style="font-weight:700;font-size:18px;letter-spacing:0.5px;color:#0A52EF;">ANC Sports</div>
</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#111;padding:0 0 8px 0;">Hi,</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#111;padding:0 0 24px 0;">
  Your proof for <strong>${safeName}</strong> is ready for review.
</td></tr>
<tr><td style="padding:0 0 24px 0;">
  <a href="${safeUrl}" style="display:inline-block;background:#0A52EF;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:6px;font-weight:600;font-size:15px;">Review Proof</a>
</td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#555;padding:0 0 8px 0;">
  Or copy this link:
</td></tr>
<tr><td style="font-size:13px;line-height:1.6;color:#0A52EF;word-break:break-all;padding:0 0 24px 0;">
  <a href="${safeUrl}" style="color:#0A52EF;text-decoration:underline;">${safeUrl}</a>
</td></tr>
<tr><td style="font-size:12px;line-height:1.6;color:#888;padding:0 0 24px 0;">
  ${escapeHtml(expiresLine)}
</td></tr>
<tr><td style="font-size:14px;line-height:1.6;color:#111;padding:24px 0 0 0;border-top:1px solid #eeeeee;">
  Best regards,<br>ANC Sports
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
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
  const base = getPublicBaseUrl()
  // Pick the first image as a preview thumbnail (video/pdf fall through)
  const firstImage = opts.attachments?.find((a) =>
    classifyFile(a.file?.[0]?.extension || '') === 'image'
  )
  const thumbnailUrl = firstImage
    ? `${base}/api/proof-share/${opts.token}/file/${firstImage.id}`
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
    ? `ANC Sports — Updated Proof: ${opts.recordName}`
    : `ANC Sports — Proof Ready for Review: ${opts.recordName}`
  return sendEmail([opts.clientEmail], subject, html, opts.designerEmail || undefined)
}
