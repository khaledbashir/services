export const dynamic = 'force-dynamic'
export const revalidate = 0

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
  recent: [] as SearchItem[],
}

function escapeLike(input: string) {
  return input.replace(/[\\%_]/g, '\\$&')
}

function normalizeQuery(value: string | null) {
  return (value || '').trim()
}

// Charlie 2026-07-14: "search out a little better, maybe more recent and
// dynamic." Two upgrades:
//   1. Ranking — exact title matches beat prefix matches beat substring
//      matches, and within the same rank the most recently touched record
//      wins (updated_at where the table has one, created_at otherwise).
//   2. Normalized matching — "big 3" finds "big3": both sides are lowered
//      and stripped of non-alphanumerics before comparing, in addition to
//      the existing ILIKE.
//
// Shared param layout for every entity query:
//   $1 = %escaped q%   (existing substring ILIKE)
//   $2 = %normalized q% or NULL when q normalizes to nothing
//   $3 = lower(q)      (exact-match rank)
//   $4 = escaped q%    (prefix-match rank)

function rankExpr(col: string) {
  return `CASE WHEN lower(${col}) = $3 THEN 0
               WHEN ${col} ILIKE $4 ESCAPE '\\' THEN 1
               WHEN ${col} ILIKE $1 ESCAPE '\\' THEN 2
               ELSE 3 END`
}

function normMatch(col: string) {
  return `($2::text IS NOT NULL AND regexp_replace(lower(${col}), '[^a-z0-9]', '', 'g') LIKE $2)`
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireRole(request, 'technician')
    if (isAuthError(auth)) return auth

    const q = normalizeQuery(new URL(request.url).searchParams.get('q'))

    // Empty query = "Recent" mode: the most recently touched records across
    // the searched entities, so the palette is useful the moment it opens.
    if (!q) {
      const recent = await dbQuery(
        `SELECT id, type, title, subtitle, href FROM (
           (SELECT e.id::text as id, 'event' as type,
                   COALESCE(e.summary, 'Event') as title,
                   COALESCE(c.name || ' • ', '') || COALESCE(v.name, 'Unknown venue') || ' • ' || TO_CHAR(e.event_date, 'Mon DD, YYYY') as subtitle,
                   '/events/' || e.id::text as href,
                   COALESCE(e.updated_at, e.created_at) as ts
            FROM events e
            LEFT JOIN venues v ON v.id = e.venue_id
            LEFT JOIN clients c ON c.id = e.client_id
            WHERE COALESCE(e.approval_status, 'approved') = 'approved'
            ORDER BY ts DESC NULLS LAST LIMIT 8)
           UNION ALL
           (SELECT c.id::text, 'client',
                   c.name,
                   COALESCE(parent.name || ' • ', '') || COALESCE(c.sport || 'Client', c.client_type),
                   '/clients/' || c.id::text,
                   COALESCE(c.updated_at, c.created_at)
            FROM clients c
            LEFT JOIN clients parent ON parent.id = c.parent_client_id
            ORDER BY 6 DESC NULLS LAST LIMIT 8)
           UNION ALL
           (SELECT v.id::text, 'venue',
                   v.name,
                   COALESCE(v.venue_type, v.address, 'Venue'),
                   '/venues/' || v.id::text,
                   v.created_at
            FROM venues v
            ORDER BY 6 DESC NULLS LAST LIMIT 8)
           UNION ALL
           (SELECT s.id::text, 'staff',
                   s.full_name,
                   COALESCE(s.title, s.email, 'Staff member'),
                   '/staff/' || s.id::text,
                   s.created_at
            FROM staff s
            ORDER BY 6 DESC NULLS LAST LIMIT 8)
           UNION ALL
           (SELECT t.id::text, 'ticket',
                   COALESCE(t.title, 'Ticket #' || t.ticket_number::text),
                   COALESCE(v.name, 'Unknown venue') || ' • ' || COALESCE(t.status, 'unknown'),
                   '/tickets/' || t.id::text,
                   COALESCE(t.updated_at, t.created_at)
            FROM tickets t
            LEFT JOIN venues v ON v.id = t.venue_id
            ORDER BY 6 DESC NULLS LAST LIMIT 8)
           UNION ALL
           (SELECT m.id::text, 'maintenance',
                   COALESCE(m.issue_summary, m.issue, 'Maintenance log'),
                   COALESCE(v.name, 'Unknown venue') || ' • ' || COALESCE(s.full_name, 'Unassigned'),
                   '/maintenance',
                   COALESCE(m.updated_at, m.created_at)
            FROM maintenance_logs m
            LEFT JOIN venues v ON v.id = m.venue_id
            LEFT JOIN staff s ON s.id = m.technician_id
            ORDER BY 6 DESC NULLS LAST LIMIT 8)
           UNION ALL
           (SELECT dr.id::text, 'design',
                   dr.job_title,
                   COALESCE(v.name, dr.company_name, 'Design request') || ' • ' || dr.status,
                   '/designs/' || dr.id::text,
                   COALESCE(dr.updated_at, dr.created_at)
            FROM design_requests dr
            LEFT JOIN venues v ON v.id = dr.venue_id
            WHERE dr.deleted_at IS NULL
            ORDER BY 6 DESC NULLS LAST LIMIT 8)
           UNION ALL
           (SELECT p.id::text, 'part',
                   p.part_name,
                   COALESCE(p.part_number, p.manufacturer, 'Part'),
                   '/parts',
                   COALESCE(p.updated_at, p.created_at)
            FROM parts p
            ORDER BY 6 DESC NULLS LAST LIMIT 8)
         ) mixed
         ORDER BY ts DESC NULLS LAST
         LIMIT 8`,
      )
      return NextResponse.json({ ...emptyResults, recent: recent.rows })
    }

    const like = `%${escapeLike(q)}%`
    const normalized = q.toLowerCase().replace(/[^a-z0-9]/g, '')
    const normLike = normalized ? `%${normalized}%` : null
    const exact = q.toLowerCase()
    const prefix = `${escapeLike(q)}%`
    const params = [like, normLike, exact, prefix]

    const [events, clients, venues, staff, tickets, maintenance, designs, parts] = await Promise.all([
      dbQuery(
        `SELECT e.id::text as id,
                COALESCE(e.summary, 'Event') as title,
                COALESCE(c.name || ' • ', '') || COALESCE(v.name, 'Unknown venue') || ' • ' || TO_CHAR(e.event_date, 'Mon DD, YYYY') as subtitle,
                '/events/' || e.id::text as href
         FROM events e
         LEFT JOIN venues v ON v.id = e.venue_id
         LEFT JOIN clients c ON c.id = e.client_id
         WHERE COALESCE(e.approval_status, 'approved') = 'approved'
           AND COALESCE(e.summary, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(v.name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(c.name, '') ILIKE $1 ESCAPE '\\'
            OR ${normMatch(`COALESCE(e.summary, '')`)}
            OR ${normMatch(`COALESCE(v.name, '')`)}
            OR ${normMatch(`COALESCE(c.name, '')`)}
         ORDER BY ${rankExpr(`COALESCE(e.summary, '')`)},
                  COALESCE(e.updated_at, e.created_at) DESC NULLS LAST
         LIMIT 5`,
        params,
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
            OR ${normMatch(`COALESCE(c.name, '')`)}
         ORDER BY ${rankExpr(`COALESCE(c.name, '')`)},
                  COALESCE(c.updated_at, c.created_at) DESC NULLS LAST
         LIMIT 5`,
        params,
      ),
      dbQuery(
        `SELECT v.id::text as id,
                v.name as title,
                COALESCE(v.venue_type, v.address, 'Venue') as subtitle,
                '/venues/' || v.id::text as href
         FROM venues v
         WHERE COALESCE(v.name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(v.address, '') ILIKE $1 ESCAPE '\\'
            OR ${normMatch(`COALESCE(v.name, '')`)}
         ORDER BY ${rankExpr(`COALESCE(v.name, '')`)},
                  v.created_at DESC NULLS LAST
         LIMIT 5`,
        params,
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
            OR ${normMatch(`COALESCE(s.full_name, '')`)}
         ORDER BY ${rankExpr(`COALESCE(s.full_name, '')`)},
                  s.created_at DESC NULLS LAST
         LIMIT 5`,
        params,
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
            OR ${normMatch(`COALESCE(t.title, '')`)}
            OR ${normMatch(`COALESCE(v.name, '')`)}
         ORDER BY ${rankExpr(`COALESCE(t.title, '')`)},
                  COALESCE(t.updated_at, t.created_at) DESC NULLS LAST
         LIMIT 5`,
        params,
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
            OR ${normMatch(`COALESCE(m.issue_summary, m.issue, '')`)}
         ORDER BY ${rankExpr(`COALESCE(m.issue_summary, m.issue, '')`)},
                  COALESCE(m.updated_at, m.created_at) DESC NULLS LAST
         LIMIT 5`,
        params,
      ),
      dbQuery(
        `SELECT dr.id::text as id,
                dr.job_title as title,
                COALESCE(v.name, dr.company_name, 'Design request') || ' • ' || dr.status as subtitle,
                '/designs/' || dr.id::text as href
         FROM design_requests dr
         LEFT JOIN venues v ON v.id = dr.venue_id
         WHERE dr.deleted_at IS NULL
           AND (COALESCE(dr.job_title, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(dr.company_name, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(dr.notes, '') ILIKE $1 ESCAPE '\\'
            OR COALESCE(v.name, '') ILIKE $1 ESCAPE '\\'
            OR ${normMatch(`COALESCE(dr.job_title, '')`)}
            OR ${normMatch(`COALESCE(dr.company_name, '')`)})
         ORDER BY ${rankExpr(`COALESCE(dr.job_title, '')`)},
                  COALESCE(dr.updated_at, dr.created_at) DESC NULLS LAST
         LIMIT 5`,
        params,
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
            OR ${normMatch(`COALESCE(p.part_name, '')`)}
            OR ${normMatch(`COALESCE(p.part_number, '')`)}
         ORDER BY ${rankExpr(`COALESCE(p.part_name, '')`)},
                  COALESCE(p.updated_at, p.created_at) DESC NULLS LAST
         LIMIT 5`,
        params,
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
      recent: [] as SearchItem[],
    })
  } catch (err) {
    console.error('Search error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
