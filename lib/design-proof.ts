import crypto from 'node:crypto'
import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { Designs, isTwentyBackedEnabled } from '@/lib/twenty-ops'

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://services.ancsports.net'

export interface DesignProofShare {
  token: string
  url: string
  emailed: boolean
  client_email: string | null
}

/**
 * Either a live share, or the reason we refused to mint one. Callers MUST
 * branch on `ok` — see the `no_proof_files` note on createDesignProofShare.
 */
export type DesignProofShareOutcome =
  | ({ ok: true } & DesignProofShare)
  | { ok: false; reason: 'no_proof_files'; existingProofUrl: string | null }

/**
 * Count everything this ticket could actually SHOW a client: files uploaded
 * through the dashboard (MinIO/bytea, `design_request_files`) plus any share
 * already pointed at a folder on the FTP. A ticket with neither has no proof.
 */
async function countProofSources(designRequestId: string): Promise<number> {
  const [uploaded, ftpBacked] = await Promise.all([
    query(
      `SELECT count(*)::int AS n FROM design_request_files WHERE design_request_id = $1`,
      [designRequestId]
    ).catch(() => ({ rows: [{ n: 0 }] })),
    query(
      `SELECT count(*)::int AS n FROM proof_shares
       WHERE twenty_record_id = $1 AND ftp_folder_path IS NOT NULL`,
      [designRequestId]
    ).catch(() => ({ rows: [{ n: 0 }] })),
  ])
  return Number(uploaded.rows[0]?.n || 0) + Number(ftpBacked.rows[0]?.n || 0)
}

/**
 * Generate a proof share link for a design request and email the client.
 * Idempotent: if an unanswered share already exists it's reused.
 *
 * Refuses with `no_proof_files` when the ticket has nothing to show. This is
 * the fix for a real production failure (Citizens Bank 2026 / FIFA 2026 - New
 * York, 2026-07-21): moving a ticket to Client Review minted a share against a
 * ticket whose proof only ever lived on the legacy workspace, then the caller
 * overwrote `ftp_proof_link` with the new URL. The client-facing page was
 * empty, the working workspace link was displaced, and the designer was told
 * the proof had been sent. A link with no proof behind it is worse than no
 * link — so we do not create one, and the caller leaves the old link intact.
 *
 * When TWENTY_BACKED_DESIGNS=1, the design lives in Twenty, so we pull
 * metadata via the REST API rather than the local `design_requests` table.
 */
export async function createDesignProofShare(params: {
  designRequestId: string
  createdByName?: string | null
  createdByEmail?: string | null
}): Promise<DesignProofShareOutcome> {
  const { designRequestId, createdByName, createdByEmail } = params

  let dr: {
    id: string
    job_title: string
    company_name: string | null
    client_email: string | null
    client_name: string | null
    ftp_proof_link: string | null
    venue_name: string | null
  } | null = null

  if (isTwentyBackedEnabled('DESIGNS')) {
    const twentyDesign = await Designs.get(designRequestId)
    if (!twentyDesign) throw new Error('Design request not found in Twenty')
    const client = (twentyDesign as any).designClient || null
    dr = {
      id: twentyDesign.id,
      job_title: twentyDesign.name || 'Proof',
      company_name: client?.name || null,
      client_email:
        (Array.isArray(client?.emails?.additionalEmails) && client.emails.additionalEmails[0]) ||
        client?.emails?.primaryEmail ||
        (twentyDesign as any).clientEmail ||
        null,
      client_name: client?.name || null,
      ftp_proof_link: (twentyDesign as any).proofLink || null,
      venue_name: (twentyDesign as any).designVenue?.name || null,
    }
  } else {
    const { rows } = await query(
      `SELECT dr.id, dr.job_title, dr.company_name, dr.client_email, dr.client_name,
              dr.ftp_proof_link, v.name AS venue_name
       FROM design_requests dr
       LEFT JOIN venues v ON v.id = dr.venue_id
       WHERE dr.id = $1`,
      [designRequestId]
    )
    if (rows.length === 0) throw new Error('Design request not found')
    dr = rows[0] as typeof dr
  }

  if (!dr) throw new Error('Design request not found')

  // Reuse an unanswered share for this record so reruns don't spam.
  // When TWENTY_BACKED_DESIGNS is on we write twenty_object_type='designRequest' so
  // the /respond handler (OBJECT_CONFIGS lookup) hits the Twenty REST path instead
  // of trying to UPDATE the local design_requests table (where the row doesn't exist).
  const objectType = isTwentyBackedEnabled('DESIGNS') ? 'designRequest' : 'localDesignRequest'
  const existing = await query(
    `SELECT token FROM proof_shares
     WHERE twenty_object_type = $1
       AND twenty_record_id = $2
       AND client_response IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [objectType, designRequestId]
  )

  // Gate BOTH paths, not just the insert: reusing an unanswered share that is
  // itself empty hands the client the same dead page a second time.
  if ((await countProofSources(designRequestId)) === 0) {
    return {
      ok: false,
      reason: 'no_proof_files',
      existingProofUrl: dr.ftp_proof_link || null,
    }
  }

  let token: string
  if (existing.rows.length > 0) {
    token = existing.rows[0].token
  } else {
    token = crypto.randomBytes(24).toString('base64url')
    await query(
      `INSERT INTO proof_shares (
         token, twenty_object_type, twenty_record_id, expires_at,
         created_by_name, created_by_email, client_email
       ) VALUES ($1, $2, $3, NULL, $4, $5, $6)`,
      [token, objectType, designRequestId, createdByName || null, createdByEmail || null, dr.client_email]
    )
  }

  const url = `${BASE_URL}/proof/${token}`
  let emailed = false
  if (dr.client_email) {
    const subject = `Proof ready for review — ${dr.job_title}`
    const clientFirst = (dr.client_name || dr.client_email.split('@')[0] || '').split(' ')[0] || 'there'
    const html = renderProofEmail({
      clientFirst,
      jobTitle: dr.job_title,
      url,
      venueName: dr.venue_name || dr.company_name || '',
    })
    emailed = await sendEmail([dr.client_email], subject, html, createdByEmail || undefined)
  }

  return { ok: true, token, url, emailed, client_email: dr.client_email }
}

function renderProofEmail(p: { clientFirst: string; jobTitle: string; url: string; venueName: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Proof Ready for Review</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Inter,Arial,sans-serif;color:#18181b">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 16px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;overflow:hidden">
        <tr><td style="padding:28px 32px 8px">
          <div style="font-size:11px;font-weight:600;letter-spacing:0.18em;text-transform:uppercase;color:#0A52EF">ANC Sports</div>
          <h1 style="margin:12px 0 0;font-size:22px;font-weight:600;color:#18181b;line-height:1.3">Proof Ready for Review</h1>
        </td></tr>
        <tr><td style="padding:16px 32px 8px;color:#52525b;font-size:15px;line-height:1.6">
          <p style="margin:0">Hi ${escapeHtml(p.clientFirst)},</p>
          <p style="margin:14px 0 0">Your proof for <strong>${escapeHtml(p.jobTitle)}</strong>${p.venueName ? ` at <strong>${escapeHtml(p.venueName)}</strong>` : ''} is ready for review. Take a look and let us know what you think.</p>
        </td></tr>
        <tr><td style="padding:20px 32px 8px" align="left">
          <a href="${p.url}" style="display:inline-block;background:#0A52EF;color:#ffffff;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px">→ Open the proof</a>
        </td></tr>
        <tr><td style="padding:8px 32px 4px;color:#71717a;font-size:13px;line-height:1.6">
          Or copy this link directly:<br>
          <a href="${p.url}" style="color:#0A52EF;word-break:break-all">${p.url}</a>
        </td></tr>
        <tr><td style="padding:20px 32px 4px">
          <div style="font-size:11px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:#71717a">What happens next</div>
          <ul style="margin:10px 0 0;padding-left:20px;color:#52525b;font-size:14px;line-height:1.7">
            <li>Click the link to view your proof</li>
            <li>Tap <strong>Approve</strong> or <strong>Request Changes</strong> — add notes if you'd like</li>
            <li>You'll get a confirmation immediately</li>
          </ul>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#fafafa;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px">
          Thanks,<br><strong style="color:#18181b">ANC Sports</strong>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string))
}
