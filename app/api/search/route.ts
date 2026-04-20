import { NextRequest, NextResponse } from 'next/server'
import { query as dbQuery } from '@/lib/db'
import { requireRole, isAuthError } from '@/lib/rbac'

type SearchItem = {
  id: string
  type: string
  title: string
  subtitle: string
  href: string
}

const emptyResults = {
  events: [] as SearchItem[],
  clients: [] as SearchItem[],
  venues: [] as SearchItem[],
  staff: [] as SearchItem[],
  tickets: [] as SearchItem[],
  maintenance: [] as SearchItem[],
  designs: [] as SearchItem[],
  parts: [] as SearchItem[],
}

function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, '\\$&')
}

function normalizeQuery(value: string | null) {
  return (value || '').trim()
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const q = normalizeQuery(new URL(request.url).searchParams.get('q'))
    if (!q) {
      return NextResponse.json(emptyResults)
    }

    const like = `%${escapeLike(q)}%`

    const [events, clients, venues, staff, tickets, maintenance, designs, parts] = await Promise.all([
      dbQuery(
        `SELECT e.id::text as id,
                COALESCE(e.summary, 'Event') as title,
                COALESCE(c.name || ' • ', '') || COALESCE(v.name, 'Unknown venue') || ' • ' || TO_CHAR(e.event_date, 'Mon DD, YYYY') as subtitle,
                '/events/' || e.id::text as href
         FROM events e
         LEFT JOIN venues v ON v.id = e.venue_id
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE COALESCE(e.summary, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(v.name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(c.name, '') ILIKE $1 ESCAPE '\\'
         ORDER BY e.event_date DESC NULLS LAST, e.created_at DESC
         LIMIT 5`,
        [like],
      ),
      dbQuery(
        `SELECT c.id::text as id,
                c.name as title,
                COALESCE(parent.name || ' • ', '') || COALESCE(c.sport || 'Client', c.client_type) as subtitle,
                '/clients/' || c.id::text as href
         FROM clients c
         LEFT JOIN clients parent ON parent.id = c.parent_client_id
         WHERE COALESCE(c.name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(c.primary_contact_name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(c.primary_contact_email, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(c.sport, '') ILIKE $1 ESCAPE '\\'
         ORDER BY c.name ASC
         LIMIT 5`,
        [like],
      ),
      dbQuery(
        `SELECT v.id::text as id,
                v.name as title,
                COALESCE(v.venue_type, v.address, 'Venue') as subtitle,
                '/venues/' || v.id::text as href
         FROM venues v
         WHERE COALESCE(v.name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(v.address, '') ILIKE $1 ESCAPE '\\'
         ORDER BY v.name ASC
         LIMIT 5`,
        [like],
      ),
      dbQuery(
        `SELECT s.id::text as id,
                s.full_name as title,
                COALESCE(s.title, s.email, 'Staff member') as subtitle,
                '/staff/' || s.id::text as href
         FROM staff s
         WHERE COALESCE(s.full_name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(s.email, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(s.title, '') ILIKE $1 ESCAPE '\\'
         ORDER BY s.full_name ASC
         LIMIT 5`,
        [like],
      ),
      dbQuery(
        `SELECT t.id::text as id,
                COALESCE(t.title, 'Ticket #' || t.ticket_number::text) as title,
                COALESCE(v.name, 'Unknown venue') || ' • ' || COALESCE(t.status, 'unknown') as subtitle,
                '/tickets/' || t.id::text as href
         FROM tickets t
         LEFT JOIN venues v ON v.id = t.venue_id
         WHERE COALESCE(t.title, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(t.description, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(t.ticket_number::text, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(v.name, '') ILIKE $1 ESCAPE '\\'
         ORDER BY t.created_at DESC
         LIMIT 5`,
        [like],
      ),
      dbQuery(
        `SELECT m.id::text as id,
                COALESCE(m.issue_summary, m.issue, 'Maintenance log') as title,
                COALESCE(v.name, 'Unknown venue') || ' • ' || COALESCE(s.full_name, 'Unassigned') as subtitle,
                '/maintenance' as href
         FROM maintenance_logs m
         LEFT JOIN venues v ON v.id = m.venue_id
         LEFT JOIN staff s ON s.id = m.technician_id
         WHERE COALESCE(m.issue_summary, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(m.issue, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(v.name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(s.full_name, '') ILIKE $1 ESCAPE '\\'
         ORDER BY m.created_at DESC
         LIMIT 5`,
        [like],
      ),
      dbQuery(
        `SELECT dr.id::text as id,
                dr.job_title as title,
                COALESCE(v.name, dr.company_name, 'Design request') || ' • ' || dr.status as subtitle,
                '/designs/' || dr.id::text as href
         FROM design_requests dr
         LEFT JOIN venues v ON v.id = dr.venue_id
         WHERE COALESCE(dr.job_title, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(dr.company_name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(dr.notes, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(v.name, '') ILIKE $1 ESCAPE '\\'
         ORDER BY COALESCE(dr.due_date, CURRENT_DATE + INTERVAL '365 days'), dr.created_at DESC
         LIMIT 5`,
        [like],
      ),
      dbQuery(
        `SELECT p.id::text as id,
                p.part_name as title,
                COALESCE(p.part_number, p.manufacturer, 'Part') as subtitle,
                '/parts' as href
         FROM parts p
         WHERE COALESCE(p.part_name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(p.part_number, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(p.manufacturer, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(p.model_name, '') ILIKE $1 ESCAPE '\\'
         ORDER BY p.part_name ASC
         LIMIT 5`,
        [like],
      ),
    ])

    return NextResponse.json({
      events: events.rows,
      clients: clients.rows,
      venues: venues.rows,
      staff: staff.rows,
      tickets: tickets.rows,
      maintenance: maintenance.rows,
      designs: designs.rows,
      parts: parts.rows,
    })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
