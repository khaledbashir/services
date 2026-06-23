import { query } from '@/lib/db'

export type AssignmentSummary = {
  id: string
  full_name: string
  role: 'designer' | 'enterprise_contact' | 'operator'
  is_primary: boolean
}

function pushUnique(map: Map<string, AssignmentSummary[]>, recordId: string, person: AssignmentSummary) {
  const list = map.get(recordId) || []
  if (!list.some((existing) => existing.id === person.id && existing.role === person.role)) {
    list.push(person)
  }
  map.set(recordId, list)
}

async function loadSummaries(ids: string[], sql: string) {
  const map = new Map<string, AssignmentSummary[]>()
  if (!ids.length) return map
  const result = await query(sql, [ids])
  for (const row of result.rows) {
    pushUnique(map, row.record_id, {
      id: row.staff_id,
      full_name: row.full_name,
      role: row.assignment_role,
      is_primary: !!row.is_primary,
    })
  }
  return map
}

export function splitDesignAssignments(assignments: AssignmentSummary[] = []) {
  return {
    designers: assignments.filter((person) => person.role === 'designer'),
    enterprise_contacts: assignments.filter((person) => person.role === 'enterprise_contact'),
  }
}

export function splitContentAssignments(assignments: AssignmentSummary[] = []) {
  return {
    operators: assignments.filter((person) => person.role === 'operator'),
    enterprise_contacts: assignments.filter((person) => person.role === 'enterprise_contact'),
  }
}

export async function loadDesignAssignmentSummaries(ids: string[]) {
  return loadSummaries(ids, `
    SELECT x.record_id, x.staff_id::text, s.full_name, x.assignment_role, x.is_primary
    FROM (
      SELECT id::text AS record_id, designer_id AS staff_id, 'designer'::text AS assignment_role, true AS is_primary, created_at AS sort_at
      FROM design_requests
      WHERE id::text = ANY($1::text[]) AND designer_id IS NOT NULL
      UNION ALL
      SELECT id::text AS record_id, enterprise_contact_id AS staff_id, 'enterprise_contact'::text AS assignment_role, true AS is_primary, created_at AS sort_at
      FROM design_requests
      WHERE id::text = ANY($1::text[]) AND enterprise_contact_id IS NOT NULL
      UNION ALL
      SELECT design_request_id::text AS record_id, staff_id, 'designer'::text AS assignment_role, is_primary, assigned_at AS sort_at
      FROM design_request_designers
      WHERE design_request_id::text = ANY($1::text[])
      UNION ALL
      SELECT design_request_id::text AS record_id, staff_id, 'enterprise_contact'::text AS assignment_role, false AS is_primary, assigned_at AS sort_at
      FROM design_request_enterprise_contacts
      WHERE design_request_id::text = ANY($1::text[])
    ) x
    JOIN staff s ON s.id = x.staff_id
    ORDER BY x.record_id, x.assignment_role, x.is_primary DESC, x.sort_at ASC
  `)
}

export async function loadCgAssignmentSummaries(ids: string[]) {
  return loadSummaries(ids, `
    SELECT x.record_id, x.staff_id::text, s.full_name, x.assignment_role, x.is_primary
    FROM (
      SELECT id::text AS record_id, designer_id AS staff_id, 'designer'::text AS assignment_role, true AS is_primary, created_at AS sort_at
      FROM cg_design_requests
      WHERE id::text = ANY($1::text[]) AND designer_id IS NOT NULL
      UNION ALL
      SELECT cg_design_request_id::text AS record_id, staff_id, 'designer'::text AS assignment_role, is_primary, assigned_at AS sort_at
      FROM cg_design_designers
      WHERE cg_design_request_id::text = ANY($1::text[])
      UNION ALL
      SELECT cg_design_request_id::text AS record_id, staff_id, 'enterprise_contact'::text AS assignment_role, false AS is_primary, assigned_at AS sort_at
      FROM cg_design_enterprise_contacts
      WHERE cg_design_request_id::text = ANY($1::text[])
    ) x
    JOIN staff s ON s.id = x.staff_id
    ORDER BY x.record_id, x.assignment_role, x.is_primary DESC, x.sort_at ASC
  `)
}

export async function loadContentAssignmentSummaries(ids: string[]) {
  return loadSummaries(ids, `
    SELECT x.record_id, x.staff_id::text, s.full_name, x.assignment_role, x.is_primary
    FROM (
      SELECT id::text AS record_id, operator_id AS staff_id, 'operator'::text AS assignment_role, true AS is_primary, created_at AS sort_at
      FROM content_schedules
      WHERE id::text = ANY($1::text[]) AND operator_id IS NOT NULL
      UNION ALL
      SELECT content_schedule_id::text AS record_id, staff_id, 'operator'::text AS assignment_role, is_primary, assigned_at AS sort_at
      FROM content_schedule_operators
      WHERE content_schedule_id::text = ANY($1::text[])
      UNION ALL
      SELECT content_schedule_id::text AS record_id, staff_id, 'enterprise_contact'::text AS assignment_role, false AS is_primary, assigned_at AS sort_at
      FROM content_schedule_enterprise_contacts
      WHERE content_schedule_id::text = ANY($1::text[])
    ) x
    JOIN staff s ON s.id = x.staff_id
    ORDER BY x.record_id, x.assignment_role, x.is_primary DESC, x.sort_at ASC
  `)
}
