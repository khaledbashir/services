/**
 * Venue walk-thru checklists — Joe 2026-08-17. See
 * scripts/migrate-venue-walkthrough-checklists.ts for the ask verbatim.
 *
 * Distinct from the free-text `walkthrough_logs` / ops-data-table walkthrough
 * log, which stays exactly as it was. This is the structured per-screen
 * checklist: a standard list per venue, assigned to a person, answered item by
 * item, and on submit it emails a summary and opens a ticket if anything is
 * wrong.
 */
import { query } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { brandedEmail } from '@/lib/email-templates'
import { getRecipients } from '@/lib/ticket-digests'

export type WalkthroughItemType = 'screen' | 'system' | 'custom'
export type WalkthroughResultValue = 'operating' | 'issue'

export interface WalkthroughTemplateItem {
  id: string
  label: string
  item_type: WalkthroughItemType
  help_text: string | null
  position: number
}

export interface WalkthroughResultInput {
  template_item_id: string
  result: WalkthroughResultValue
  detail?: string | null
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Template (the standard walk for a venue) ────────────────────────────────

/**
 * "Once created it should become the standard walk for the venue" — so there
 * is exactly one template row per venue and it is created on first touch
 * rather than needing a separate setup step.
 */
export async function getOrCreateTemplate(venueId: string, staffId?: string | null): Promise<{ id: string; name: string }> {
  const existing = await query(
    `SELECT id, name FROM venue_walkthrough_templates WHERE venue_id = $1`,
    [venueId],
  )
  if (existing.rows[0]) return existing.rows[0]

  const created = await query(
    `INSERT INTO venue_walkthrough_templates (venue_id, created_by)
     VALUES ($1, $2)
     ON CONFLICT (venue_id) DO UPDATE SET updated_at = NOW()
     RETURNING id, name`,
    [venueId, staffId || null],
  )
  return created.rows[0]
}

export async function listTemplateItems(templateId: string): Promise<WalkthroughTemplateItem[]> {
  const result = await query(
    `SELECT id, label, item_type, help_text, position
     FROM venue_walkthrough_template_items
     WHERE template_id = $1 AND is_active = true
     ORDER BY position, label`,
    [templateId],
  )
  return result.rows
}

/**
 * Replace the venue's checklist in one transaction.
 *
 * Items that survive keep their id, so historical results stay attached to the
 * screen they were about. Items that disappear are deactivated rather than
 * deleted, for the same reason.
 */
export async function replaceTemplateItems(
  templateId: string,
  items: Array<{ id?: string | null; label: string; item_type?: WalkthroughItemType; help_text?: string | null }>,
): Promise<WalkthroughTemplateItem[]> {
  const keptIds: string[] = []

  for (const [index, item] of items.entries()) {
    const label = item.label?.trim()
    if (!label) continue
    const itemType: WalkthroughItemType = item.item_type || 'screen'

    if (item.id) {
      const updated = await query(
        `UPDATE venue_walkthrough_template_items
         SET label = $2, item_type = $3, help_text = $4, position = $5,
             is_active = true, updated_at = NOW()
         WHERE id = $1 AND template_id = $6
         RETURNING id`,
        [item.id, label, itemType, item.help_text || null, index, templateId],
      )
      if (updated.rows[0]) {
        keptIds.push(updated.rows[0].id)
        continue
      }
    }

    const inserted = await query(
      `INSERT INTO venue_walkthrough_template_items (template_id, label, item_type, help_text, position)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [templateId, label, itemType, item.help_text || null, index],
    )
    keptIds.push(inserted.rows[0].id)
  }

  await query(
    `UPDATE venue_walkthrough_template_items
     SET is_active = false, updated_at = NOW()
     WHERE template_id = $1
       AND is_active = true
       AND NOT (id = ANY($2::uuid[]))`,
    [templateId, keptIds],
  )

  await query(`UPDATE venue_walkthrough_templates SET updated_at = NOW() WHERE id = $1`, [templateId])

  return listTemplateItems(templateId)
}

// ── Assignment + submission ─────────────────────────────────────────────────

/**
 * Assign the venue's standard walk to one person for one date — "can be
 * assigned by a manager just like an event".
 *
 * The item list is snapshotted onto result rows at assignment time so the
 * person walking the building answers the list as it stood when they were
 * given it, not a list someone edited underneath them mid-walk.
 */
export async function createWalkthrough(input: {
  venueId: string
  assignedStaffId: string
  assignedBy: string
  scheduledFor?: string | null
}): Promise<{ id: string; item_count: number }> {
  const template = await getOrCreateTemplate(input.venueId, input.assignedBy)
  const items = await listTemplateItems(template.id)

  const created = await query(
    `INSERT INTO venue_walkthroughs (venue_id, template_id, assigned_staff_id, assigned_by, scheduled_for)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [input.venueId, template.id, input.assignedStaffId, input.assignedBy, input.scheduledFor || null],
  )
  const walkthroughId = created.rows[0].id

  for (const item of items) {
    await query(
      `INSERT INTO venue_walkthrough_results (walkthrough_id, template_item_id, label, item_type, position)
       VALUES ($1, $2, $3, $4, $5)`,
      [walkthroughId, item.id, item.label, item.item_type, item.position],
    )
  }

  return { id: walkthroughId, item_count: items.length }
}

export async function getWalkthrough(walkthroughId: string) {
  const header = await query(
    `SELECT w.id, w.venue_id, w.template_id, w.status,
            TO_CHAR(w.scheduled_for, 'YYYY-MM-DD') AS scheduled_for,
            w.submitted_at, w.summary_sent_at, w.generated_ticket_id, w.notes,
            v.name AS venue_name,
            assignee.full_name AS assigned_staff_name,
            w.assigned_staff_id,
            t.ticket_number AS generated_ticket_number
     FROM venue_walkthroughs w
     LEFT JOIN venues v ON v.id = w.venue_id
     LEFT JOIN staff assignee ON assignee.id = w.assigned_staff_id
     LEFT JOIN tickets t ON t.id = w.generated_ticket_id
     WHERE w.id = $1`,
    [walkthroughId],
  )
  if (!header.rows[0]) return null

  const results = await query(
    `SELECT id, template_item_id, label, item_type, position, result, detail
     FROM venue_walkthrough_results
     WHERE walkthrough_id = $1
     ORDER BY position, label`,
    [walkthroughId],
  )

  return { ...header.rows[0], items: results.rows }
}

/**
 * Recipients for the submitted-walk summary.
 *
 * "a summary gets received by the same emails in the ticket system" — so the
 * default IS the ticket open-review list rather than a copy of it, and a
 * `walkthrough_summary_recipients` row in app_settings can override it later
 * without a deploy, matching how the ticket digests already work.
 */
export async function getSummaryRecipients(): Promise<string[]> {
  const override = await query(
    `SELECT value FROM app_settings WHERE key = 'walkthrough_summary_recipients'`,
  )
  if (override.rows[0]) {
    const stored = String(override.rows[0].value ?? '')
    if (stored.trim() === '') return []
    const parsed = stored.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
    if (parsed.length > 0) return parsed
  }
  return getRecipients('open-review')
}

export interface SubmitWalkthroughResult {
  walkthrough_id: string
  issue_count: number
  ticket_id: string | null
  ticket_number: number | null
  summary_sent: boolean
  recipients: string[]
}

export async function submitWalkthrough(input: {
  walkthroughId: string
  submittedBy: string
  submittedByName: string
  results: WalkthroughResultInput[]
  notes?: string | null
}): Promise<SubmitWalkthroughResult> {
  // Persist every answer first. The DB constraint refuses an `issue` with no
  // detail, so a malformed payload fails here rather than producing a ticket
  // that says nothing.
  for (const answer of input.results) {
    await query(
      `UPDATE venue_walkthrough_results
       SET result = $3, detail = $4, updated_at = NOW()
       WHERE walkthrough_id = $1 AND template_item_id = $2`,
      [input.walkthroughId, answer.template_item_id, answer.result, answer.detail?.trim() || null],
    )
  }

  await query(
    `UPDATE venue_walkthroughs
     SET status = 'submitted', submitted_at = NOW(), submitted_by = $2,
         notes = COALESCE($3, notes), updated_at = NOW()
     WHERE id = $1`,
    [input.walkthroughId, input.submittedBy, input.notes?.trim() || null],
  )

  const walkthrough = await getWalkthrough(input.walkthroughId)
  if (!walkthrough) throw new Error('Walk-thru disappeared during submit')

  const issues = walkthrough.items.filter((item: any) => item.result === 'issue')

  // "If any issues were found, a ticket gets autogenerated with the issues
  // outlined." One ticket per walk-thru, listing every issue, so the venue
  // gets a single actionable thread instead of one ticket per screen.
  let ticketId: string | null = null
  let ticketNumber: number | null = null
  if (issues.length > 0) {
    const description = [
      `Walk-thru at ${walkthrough.venue_name} on ${walkthrough.scheduled_for || new Date().toISOString().slice(0, 10)}`,
      `Performed by ${input.submittedByName}`,
      '',
      `${issues.length} issue${issues.length === 1 ? '' : 's'} found:`,
      ...issues.map((item: any, index: number) => `${index + 1}. ${item.label} — ${item.detail}`),
      ...(walkthrough.notes ? ['', `Notes: ${walkthrough.notes}`] : []),
    ].join('\n')

    const ticket = await query(
      `INSERT INTO tickets (venue_id, created_by, title, description, priority, status, category, source, ticket_type)
       VALUES ($1, $2, $3, $4, 'medium', 'open', 'maintenance', 'walkthrough', 'support')
       RETURNING id, ticket_number`,
      [
        walkthrough.venue_id,
        input.submittedBy,
        `Walk-thru issues — ${walkthrough.venue_name} (${issues.length})`,
        description,
      ],
    )
    ticketId = ticket.rows[0].id
    ticketNumber = ticket.rows[0].ticket_number

    await query(
      `UPDATE venue_walkthroughs SET generated_ticket_id = $2, updated_at = NOW() WHERE id = $1`,
      [input.walkthroughId, ticketId],
    )
  }

  const recipients = await getSummaryRecipients()
  let summarySent = false
  if (recipients.length > 0) {
    const rows = walkthrough.items
      .map((item: any) => {
        const isIssue = item.result === 'issue'
        const status = isIssue
          ? '<span style="color:#b91c1c;font-weight:600">Issue found</span>'
          : item.result === 'operating'
            ? '<span style="color:#047857">Operating as intended</span>'
            : '<span style="color:#6b7280">Not answered</span>'
        const detail = isIssue && item.detail
          ? `<div style="color:#7f1d1d;font-size:12px;margin-top:4px">${escapeHtml(item.detail)}</div>`
          : ''
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${escapeHtml(item.label)}${detail}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right;white-space:nowrap">${status}</td>
        </tr>`
      })
      .join('')

    const ticketLine = ticketId
      ? `<p style="margin:16px 0 0"><strong>Ticket #${ticketNumber}</strong> was opened for the ${issues.length} issue${issues.length === 1 ? '' : 's'} above.</p>`
      : '<p style="margin:16px 0 0">No issues were reported, so no ticket was opened.</p>'

    const html = brandedEmail({
      title: `Walk-thru complete — ${walkthrough.venue_name}`,
      subtitle: `${input.submittedByName} · ${walkthrough.scheduled_for || new Date().toISOString().slice(0, 10)}`,
      bodyHtml: `
        <p style="margin:0 0 12px">
          ${issues.length > 0
            ? `<strong style="color:#b91c1c">${issues.length} issue${issues.length === 1 ? '' : 's'} found</strong>`
            : '<strong style="color:#047857">Everything operating as intended</strong>'}
          across ${walkthrough.items.length} checked item${walkthrough.items.length === 1 ? '' : 's'}.
        </p>
        <table style="width:100%;border-collapse:collapse;font-size:13px">${rows}</table>
        ${ticketLine}
      `,
      footerNote: 'ANC Sports · walk-thru summary',
    })

    summarySent = await sendEmail(
      recipients,
      `Walk-thru — ${walkthrough.venue_name}${issues.length > 0 ? ` — ${issues.length} issue${issues.length === 1 ? '' : 's'}` : ''}`,
      html,
    )

    if (summarySent) {
      await query(
        `UPDATE venue_walkthroughs
         SET summary_sent_at = NOW(), summary_recipients = $2, updated_at = NOW()
         WHERE id = $1`,
        [input.walkthroughId, recipients],
      )
    }
  }

  return {
    walkthrough_id: input.walkthroughId,
    issue_count: issues.length,
    ticket_id: ticketId,
    ticket_number: ticketNumber,
    summary_sent: summarySent,
    recipients,
  }
}
