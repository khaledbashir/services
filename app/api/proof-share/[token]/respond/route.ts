import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import {
  OBJECT_CONFIGS,
  updateTwentyRecordStatus,
  patchTwentyRecord,
} from '@/lib/proof-share'
import { sendSlackMessage } from '@/lib/slack'

/**
 * POST /api/proof-share/[token]/respond
 *
 * Body:
 *   response: 'approved' | 'changes_requested'
 *   note?:    string (optional feedback from the client)
 *   name?:    string (optional client name)
 *
 * Updates the proof_shares row, updates the Twenty record's status,
 * and Slack-pings the designer.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params
    const body = await request.json()
    const { response, note, name } = body

    if (response !== 'approved' && response !== 'changes_requested') {
      return NextResponse.json(
        { error: 'response must be "approved" or "changes_requested"' },
        { status: 400 }
      )
    }

    // Fetch the share
    const shareResult = await query(
      `SELECT token, twenty_object_type, twenty_record_id, expires_at,
              client_response, created_by_name, created_by_email, message
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

    // Native anc-services design requests — update our DB directly.
    if (share.twenty_object_type === 'localDesignRequest') {
      await query(
        `UPDATE proof_shares
         SET client_response = $2, client_response_at = NOW(), client_response_note = $3
         WHERE token = $1`,
        [token, response, note || null]
      )
      const newStatus = response === 'approved' ? 'approved' : 'in_progress'
      await query(
        `UPDATE design_requests SET status = $1, updated_at = NOW() WHERE id = $2`,
        [newStatus, share.twenty_record_id]
      )
    } else {
      const cfg = OBJECT_CONFIGS[share.twenty_object_type]
      if (!cfg) {
        return NextResponse.json({ error: 'Invalid record type' }, { status: 500 })
      }

      // Update proof_shares
      await query(
        `UPDATE proof_shares
         SET client_response = $2, client_response_at = NOW(), client_response_note = $3
         WHERE token = $1`,
        [token, response, note || null]
      )

      // Update Twenty record status + proof-response fields
      const newStatus =
        response === 'approved' ? cfg.approvedValue : cfg.revisionsValue
      await updateTwentyRecordStatus(
        share.twenty_object_type,
        share.twenty_record_id,
        newStatus
      )
      void patchTwentyRecord(share.twenty_object_type, share.twenty_record_id, {
        proofRespondedAt: new Date().toISOString(),
      })
    }

    // Slack notify the designer (if we have Slack configured)
    const slackChannel = process.env.SLACK_DEFAULT_CHANNEL || ''
    if (slackChannel) {
      const emoji = response === 'approved' ? '✅' : '✏️'
      const title =
        response === 'approved' ? 'Client approved a proof' : 'Client requested changes'
      const designerLabel = share.created_by_name || share.created_by_email || 'a designer'
      const bodyPreview = note ? `\n\n> ${note.slice(0, 500)}` : ''
      const respondentLabel = name ? ` from ${name}` : ''
      const displayLabel = share.twenty_object_type === 'localDesignRequest'
        ? 'Design Request'
        : (OBJECT_CONFIGS[share.twenty_object_type]?.displayLabel || share.twenty_object_type)
      await sendSlackMessage({
        channel: slackChannel,
        text: `${emoji} ${title}${respondentLabel}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `${emoji} *${title}*${respondentLabel}`,
            },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Record type:*\n${displayLabel}` },
              { type: 'mrkdwn', text: `*Response:*\n${response}` },
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
