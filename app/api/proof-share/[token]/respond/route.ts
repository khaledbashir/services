import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import {
  OBJECT_CONFIGS,
  updateTwentyRecordStatus,
  patchTwentyRecord,
} from '@/lib/proof-share'
import { sendSlackMessage } from '@/lib/slack'
import { logDesignActivity } from '@/lib/design-activity'
import { parseManifest } from '@/lib/proof-share-sync'

/**
 * POST /api/proof-share/[token]/respond
 *
 * Body:
 *   response: 'approved' | 'changes_requested'
 *   note?:    string (optional feedback from the client)
 *   name?:    string (optional client name)
 *   fileId?:  string (respond to ONE file instead of the whole proof)
 *
 * Whole-proof mode (no fileId — original behavior): records the decision,
 * updates the linked record's status, Slack-pings the team.
 *
 * Per-file mode (fileId set): records the decision against that file in
 * proof_shares.file_responses. When every active file has a decision, the
 * share finalizes automatically — the rollup is `approved` only if every
 * file was approved, otherwise `changes_requested` — and the same status
 * write-backs and Slack ping fire once.
 */

type FileResponseEntry = { response: string; note: string | null; name: string | null; at: string }

/** One line per proof file, for the ticket History timeline. */
type FileBreakdown = { name: string; response: 'approved' | 'changes_requested'; note: string | null }

/** Stable per-file id — must match the roster GET (`ftp-<base64url(name)>`). */
function fileIdFor(name: string): string {
  return `ftp-${Buffer.from(name).toString('base64url')}`
}

/** Active files in an FTP-backed share, in manifest order. */
function activeManifestFiles(ftpManifest: unknown): { id: string; name: string }[] {
  return parseManifest(ftpManifest)
    .filter((file) => file.active !== false)
    .map((file) => ({ id: fileIdFor(file.name), name: file.name }))
}

async function finalizeShare(
  token: string,
  share: {
    twenty_object_type: string
    twenty_record_id: string | null
    client_name: string | null
  },
  response: 'approved' | 'changes_requested',
  note: string | null,
  fileBreakdown?: FileBreakdown[]
) {
  if (share.twenty_object_type === 'ftpFolder') {
    // FTP-folder shares live entirely in our DB — no Twenty record, no local
    // design request to update. Just record the client's decision.
    await query(
      `UPDATE proof_shares
       SET client_response = $2, client_response_at = NOW(), client_response_note = $3
       WHERE token = $1`,
      [token, response, note]
    )
  } else if (share.twenty_object_type === 'localDesignRequest') {
    // Native anc-services design requests — update our DB directly.
    await query(
      `UPDATE proof_shares
       SET client_response = $2, client_response_at = NOW(), client_response_note = $3
       WHERE token = $1`,
      [token, response, note]
    )
    // Charlie 2026-07-16: full approve → approved; any deny / changes → In Queue
    // so design can re-pick the job, not stay stuck In Progress.
    const newStatus = response === 'approved' ? 'approved' : 'in_queue'
    await query(
      `UPDATE design_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, share.twenty_record_id]
    )
    await logDesignActivity({
      designRequestId: share.twenty_record_id as string,
      eventType: 'client_response',
      actor: { fullName: share.client_name || 'Client' },
      toValue: response,
      detail: {
        note: note || null,
        proofToken: token,
        // Per-file breakdown so the History timeline shows exactly which files
        // were approved vs sent back (Charlie 2026-07-15), not one text blob.
        fileResponses: fileBreakdown && fileBreakdown.length ? fileBreakdown : null,
        approvedCount: fileBreakdown ? fileBreakdown.filter((f) => f.response === 'approved').length : null,
        changesCount: fileBreakdown ? fileBreakdown.filter((f) => f.response === 'changes_requested').length : null,
      },
    })
  } else {
    const cfg = OBJECT_CONFIGS[share.twenty_object_type]
    if (!cfg) throw new Error('Invalid record type')

    await query(
      `UPDATE proof_shares
       SET client_response = $2, client_response_at = NOW(), client_response_note = $3
       WHERE token = $1`,
      [token, response, note]
    )

    const newStatus = response === 'approved' ? cfg.approvedValue : cfg.revisionsValue
    await updateTwentyRecordStatus(
      share.twenty_object_type,
      share.twenty_record_id as string,
      newStatus
    )
    void patchTwentyRecord(share.twenty_object_type, share.twenty_record_id as string, {
      proofRespondedAt: new Date().toISOString(),
    })
  }
}

function notifySlack(
  token: string,
  share: { twenty_object_type: string; created_by_name: string | null; created_by_email: string | null },
  response: 'approved' | 'changes_requested',
  note: string | null,
  name: string | null,
  breakdown?: { approved: number; changesRequested: number }
) {
  const slackChannel = process.env.SLACK_DEFAULT_CHANNEL || ''
  if (!slackChannel) return
  const emoji = response === 'approved' ? '✅' : '✏️'
  const title = response === 'approved' ? 'Client approved a proof' : 'Client requested changes'
  const designerLabel = share.created_by_name || share.created_by_email || 'a designer'
  const bodyPreview = note ? `\n\n> ${note.slice(0, 500)}` : ''
  const respondentLabel = name ? ` from ${name}` : ''
  const displayLabel = share.twenty_object_type === 'localDesignRequest'
    ? 'Design Request'
    : share.twenty_object_type === 'ftpFolder'
    ? 'Proof'
    : (OBJECT_CONFIGS[share.twenty_object_type]?.displayLabel || share.twenty_object_type)
  const responseText = breakdown
    ? `${response} (${breakdown.approved} approved · ${breakdown.changesRequested} changes)`
    : response
  void sendSlackMessage({
    channel: slackChannel,
    text: `${emoji} ${title}${respondentLabel}`,
    blocks: [
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `${emoji} *${title}*${respondentLabel}` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Record type:*\n${displayLabel}` },
          { type: 'mrkdwn', text: `*Response:*\n${responseText}` },
          { type: 'mrkdwn', text: `*Sent by:*\n${designerLabel}` },
          { type: 'mrkdwn', text: `*Token:*\n\`${token.slice(0, 12)}...\`` },
        ],
      },
      ...(note
        ? [
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Client note:*${bodyPreview}` },
            },
          ]
        : []),
    ],
  }).catch((e) => console.error('[proof-share/respond] slack failed:', e))
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { response, note, name, fileId } = body

    if (response !== 'approved' && response !== 'changes_requested') {
      return NextResponse.json(
        { error: 'response must be "approved" or "changes_requested"' },
        { status: 400 }
      )
    }

    // Fetch the share
    const shareResult = await query(
      `SELECT token, twenty_object_type, twenty_record_id, expires_at,
              client_response, created_by_name, created_by_email, message,
              client_name, ftp_folder_path, ftp_manifest, file_responses
       FROM proof_shares WHERE token = $1`,
      [token]
    )
    if (shareResult.rows.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const share = shareResult.rows[0]

    if (share.expires_at && new Date(share.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This proof link has expired.' }, { status: 410 })
    }

    if (share.client_response) {
      return NextResponse.json(
        {
          error: 'This proof has already been responded to.',
          state: share.client_response === 'approved' ? 'approved' : 'changes_requested',
        },
        { status: 409 }
      )
    }

    // ── Per-file mode ────────────────────────────────────────────────────────
    if (fileId) {
      if (typeof fileId !== 'string' || fileId.length > 600) {
        return NextResponse.json({ error: 'Invalid fileId' }, { status: 400 })
      }
      const entry: FileResponseEntry = {
        response,
        note: note || null,
        name: name || null,
        at: new Date().toISOString(),
      }
      await query(
        `UPDATE proof_shares
         SET file_responses = COALESCE(file_responses, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb)
         WHERE token = $1`,
        [token, fileId, JSON.stringify(entry)]
      )

      const merged: Record<string, FileResponseEntry> = {
        ...(share.file_responses && typeof share.file_responses === 'object' ? share.file_responses : {}),
        [fileId]: entry,
      }

      // Auto-finalize FTP-backed shares once every active file has a decision.
      if (share.ftp_folder_path) {
        const activeFiles = activeManifestFiles(share.ftp_manifest)
        const respondedIds = activeFiles.filter((f) => merged[f.id])
        if (activeFiles.length > 0 && respondedIds.length === activeFiles.length) {
          const changesRequested = activeFiles.filter(
            (f) => merged[f.id].response === 'changes_requested'
          ).length
          const rollup = changesRequested > 0 ? 'changes_requested' : 'approved'
          const breakdown: FileBreakdown[] = activeFiles.map((f) => ({
            name: f.name,
            response: merged[f.id].response === 'changes_requested' ? 'changes_requested' : 'approved',
            note: merged[f.id].note || null,
          }))
          const combinedNote = breakdown
            .filter((r) => r.note)
            .map((r) => r.note)
            .join('\n')
          await finalizeShare(token, share, rollup, combinedNote || note || null, breakdown)
          notifySlack(token, share, rollup, combinedNote || note || null, name || null, {
            approved: activeFiles.length - changesRequested,
            changesRequested,
          })
          return NextResponse.json({
            ok: true,
            fileId,
            response,
            complete: true,
            state: rollup,
            responded: respondedIds.length,
            total: activeFiles.length,
          })
        }
        return NextResponse.json({
          ok: true,
          fileId,
          response,
          complete: false,
          state: 'pending',
          responded: respondedIds.length,
          total: activeFiles.length,
        })
      }

      return NextResponse.json({ ok: true, fileId, response, complete: false, state: 'pending' })
    }

    // ── Whole-proof mode ─────────────────────────────────────────────────────
    // The client approved/requested-changes on the WHOLE proof in one click.
    // Stamp that same decision onto every file that has no per-file response yet
    // so the staff roster reads "N approved" instead of "N awaiting" — the bug
    // Charlie flagged 2026-07-15 (one-click approve left files showing awaiting).
    let breakdown: FileBreakdown[] | undefined
    if (share.ftp_folder_path) {
      const existing: Record<string, FileResponseEntry> =
        share.file_responses && typeof share.file_responses === 'object' ? share.file_responses : {}
      const at = new Date().toISOString()
      const activeFiles = activeManifestFiles(share.ftp_manifest)
      const backfilled: Record<string, FileResponseEntry> = { ...existing }
      for (const f of activeFiles) {
        if (!backfilled[f.id]) backfilled[f.id] = { response, note: null, name: f.name, at }
      }
      if (activeFiles.length > 0) {
        await query(
          `UPDATE proof_shares SET file_responses = $2::jsonb WHERE token = $1`,
          [token, JSON.stringify(backfilled)]
        )
        breakdown = activeFiles.map((f) => ({
          name: f.name,
          response: backfilled[f.id].response === 'changes_requested' ? 'changes_requested' : 'approved',
          note: backfilled[f.id].note || null,
        }))
      }
    }

    await finalizeShare(token, share, response, note || null, breakdown)
    notifySlack(
      token,
      share,
      response,
      note || null,
      name || null,
      breakdown
        ? {
            approved: breakdown.filter((b) => b.response === 'approved').length,
            changesRequested: breakdown.filter((b) => b.response === 'changes_requested').length,
          }
        : undefined
    )

    return NextResponse.json({
      ok: true,
      response,
      state: response === 'approved' ? 'approved' : 'changes_requested',
    })
  } catch (err) {
    console.error('[proof-share/respond] error:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unexpected error' },
      { status: 500 }
    )
  }
}
