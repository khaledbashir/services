export const dynamic = 'force-dynamic'
export const revalidate = 0

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { twentyClient } from '@/lib/twenty-client'

const DEFAULT_AUDIT_DIR = '/root/anc-hubspot-audit/2026-05-21T21-02-35-968Z-full-export'

type FormSummary = {
  guid: string
  name: string
  file: string
}

function cleanEmail(value: unknown): string | null {
  const email = String(value || '').trim().toLowerCase()
  if (!email || !email.includes('@') || email.includes('*redacted*')) return null
  return email
}

function submittedAt(value: unknown): Date | null {
  const n = Number(value || 0)
  if (!n) return null
  return new Date(n)
}

function fieldMap(values: Array<{ name?: string; value?: unknown }> = []): Record<string, string> {
  const fields: Record<string, string> = {}
  for (const item of values) {
    const name = String(item.name || '').trim()
    if (!name) continue
    const value = String(item.value || '').trim()
    if (!value || value.includes('*redacted*')) continue
    if (fields[name]) fields[name] = `${fields[name]}; ${value}`
    else fields[name] = value
  }
  return fields
}

async function attachTwentyNote(contact: any, submission: { formTitle: string; submittedAt: Date | null; pageUrl?: string | null; fields: Record<string, string> }) {
  if (!contact?.crm_person_id || !twentyClient.isConfigured()) return null

  const lines = [
    `Imported HubSpot form submission: ${submission.formTitle}`,
    submission.submittedAt ? `Submitted: ${submission.submittedAt.toISOString()}` : null,
    submission.pageUrl ? `Source page: ${submission.pageUrl}` : null,
    '',
    ...Object.entries(submission.fields).slice(0, 20).map(([key, value]) => `- ${key}: ${value}`),
  ].filter(Boolean).join('\n')

  const note = await twentyClient.createNote({
    title: `HubSpot form: ${submission.formTitle}`,
    bodyMarkdown: lines,
  })
  await twentyClient.createNoteTarget({ noteId: note.id, personId: contact.crm_person_id })
  return note.id
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const auditDir = String(body.auditDir || DEFAULT_AUDIT_DIR)
    const limit = Math.max(1, Math.min(Number(body.limit || 1000), 5000))
    const attachNotes = Boolean(body.attachNotes)
    const summaryPath = path.join(auditDir, 'forms-submission-summary.json')
    const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf8')) as { forms: FormSummary[] }

    let imported = 0
    let skipped = 0
    let notesCreated = 0

    for (const form of summary.forms || []) {
      if (imported >= limit) break
      const file = path.join(auditDir, form.file)
      if (!fs.existsSync(file)) continue

      const rl = readline.createInterface({
        input: fs.createReadStream(file),
        crlfDelay: Infinity,
      })

      for await (const line of rl) {
        if (imported >= limit) break
        const trimmed = line.trim()
        if (!trimmed) continue

        const raw = JSON.parse(trimmed)
        const fields = fieldMap(raw.values || [])
        const email = cleanEmail(fields.email)
        if (!email) {
          skipped += 1
          continue
        }

        const existingRes = await query(
          `SELECT crm_person_id, crm_note_id FROM marketing_form_submissions WHERE source_id = $1 LIMIT 1`,
          [raw.conversionId],
        )
        const existingCrmPersonId = existingRes.rows[0]?.crm_person_id || null
        const existingNoteId = existingRes.rows[0]?.crm_note_id || null
        const contactRes = await query(`SELECT id, crm_person_id FROM marketing_contacts WHERE email = $1 LIMIT 1`, [email])
        const contact = contactRes.rows[0] || null
        let crmPersonId: string | null = contact?.crm_person_id || existingCrmPersonId || null
        let noteId: string | null = existingNoteId
        let timelineStatus = 'archived'

        if (attachNotes && !crmPersonId && twentyClient.isConfigured()) {
          try {
            const person = await twentyClient.findPersonByEmail(email)
            crmPersonId = person?.id || null
            if (crmPersonId && contact?.id) {
              await query(
                `UPDATE marketing_contacts
                 SET crm_person_id = $2, updated_at = NOW()
                 WHERE id = $1 AND crm_person_id IS NULL`,
                [contact.id, crmPersonId],
              )
            }
          } catch (err) {
            console.error('HubSpot form submission CRM person lookup failed:', err)
          }
        }

        if (existingNoteId) {
          timelineStatus = 'crm_note_created'
        } else if (attachNotes && crmPersonId) {
          try {
            noteId = await attachTwentyNote({ crm_person_id: crmPersonId }, {
              formTitle: form.name,
              submittedAt: submittedAt(raw.submittedAt),
              pageUrl: raw.pageUrl || null,
              fields,
            })
            if (noteId) {
              notesCreated += 1
              timelineStatus = 'crm_note_created'
            }
          } catch (err) {
            timelineStatus = 'crm_note_failed'
            console.error('HubSpot form submission CRM note failed:', err)
          }
        }

        const result = await query(
          `INSERT INTO marketing_form_submissions
            (source, source_id, form_id, form_title, submitted_at, email, first_name, last_name,
             company_name, page_url, contact_id, crm_person_id, crm_note_id, timeline_status, fields, raw)
           VALUES ('hubspot', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb)
           ON CONFLICT (source_id) DO UPDATE
             SET contact_id = COALESCE(EXCLUDED.contact_id, marketing_form_submissions.contact_id),
                 crm_person_id = COALESCE(EXCLUDED.crm_person_id, marketing_form_submissions.crm_person_id),
                 crm_note_id = COALESCE(EXCLUDED.crm_note_id, marketing_form_submissions.crm_note_id),
                 timeline_status = EXCLUDED.timeline_status,
                 updated_at = NOW()
           RETURNING id`,
          [
            raw.conversionId,
            form.guid,
            form.name,
            submittedAt(raw.submittedAt),
            email,
            fields.firstname || fields.first_name || null,
            fields.lastname || fields.last_name || null,
            fields.company || fields.company_name || null,
            raw.pageUrl || null,
            contact?.id || null,
            crmPersonId,
            noteId,
            timelineStatus,
            JSON.stringify(fields),
            JSON.stringify(raw),
          ],
        )
        if (result.rowCount) imported += 1
      }
    }

    return NextResponse.json({ imported, skipped, notesCreated, attachNotes })
  } catch (err) {
    console.error('Error importing HubSpot form submissions:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
