/**
 * Shared helpers for the ElevenLabs CRM action endpoints.
 *
 * Voice agents speak names ("the Prudential opportunity", "Joe Occhipinti")
 * — these helpers turn natural-language references into Twenty record IDs
 * so the action endpoints don't all duplicate the lookup logic.
 */

import {
  twentyClient,
  type TwentyCompany,
  type TwentyOpportunity,
  type TwentyPerson,
  type TwentyVenue,
} from '@/lib/twenty-client'
import { containsFilter } from '@/lib/elevenlabs-internal-auth'

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function scoreName(query: string, candidate: string): number {
  const q = normalize(query)
  const c = normalize(candidate)
  if (c === q) return 100
  if (c.startsWith(q)) return 90
  if (c.includes(q)) return 75
  if (q.includes(c)) return 60
  return 0
}

export interface ResolvedCompany {
  id: string
  record: TwentyCompany
}

export async function resolveCompany(query: string): Promise<ResolvedCompany | null> {
  const cleaned = query.trim()
  if (!cleaned) return null
  const hits = await twentyClient.getCompanies(containsFilter('name', cleaned))
  if (hits.length === 0) return null
  const best = hits.slice().sort((a, b) => scoreName(cleaned, b.name) - scoreName(cleaned, a.name))[0]
  return { id: best.id, record: best }
}

export interface ResolvedVenue {
  id: string
  record: TwentyVenue
}

export async function resolveVenue(query: string): Promise<ResolvedVenue | null> {
  const cleaned = query.trim()
  if (!cleaned) return null
  const hits = await twentyClient.getVenues(containsFilter('name', cleaned))
  if (hits.length === 0) return null
  const best = hits.slice().sort((a, b) => scoreName(cleaned, b.name) - scoreName(cleaned, a.name))[0]
  return { id: best.id, record: best }
}

export interface ResolvedOpportunity {
  id: string
  record: TwentyOpportunity
}

export async function resolveOpportunity(query: string): Promise<ResolvedOpportunity | null> {
  const cleaned = query.trim()
  if (!cleaned) return null
  const hits = await twentyClient.getOpportunities(containsFilter('name', cleaned))
  if (hits.length === 0) return null
  const best = hits.slice().sort((a, b) => scoreName(cleaned, b.name) - scoreName(cleaned, a.name))[0]
  return { id: best.id, record: best }
}

export interface ResolvedPerson {
  id: string
  record: TwentyPerson
  fullName: string
}

export async function resolvePerson(query: string): Promise<ResolvedPerson | null> {
  const cleaned = query.trim()
  if (!cleaned) return null
  const parts = cleaned.split(/\s+/)
  // Twenty's REST `filter` doesn't support OR easily — search by last name
  // (usually more specific) and by first name, then merge + score by full
  // name match.
  const last = parts[parts.length - 1]
  const first = parts[0]
  const [byLast, byFirst] = await Promise.all([
    twentyClient.getPeople(`name.lastName[ilike]:"%25${encodeURIComponent(last)}%25"`),
    parts.length > 1
      ? twentyClient.getPeople(`name.firstName[ilike]:"%25${encodeURIComponent(first)}%25"`)
      : Promise.resolve([]),
  ])
  const seen = new Set<string>()
  const merged: TwentyPerson[] = []
  for (const p of [...byLast, ...byFirst]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    merged.push(p)
  }
  if (merged.length === 0) return null
  const best = merged.sort((a, b) => {
    const aFull = `${a.name?.firstName || ''} ${a.name?.lastName || ''}`.trim()
    const bFull = `${b.name?.firstName || ''} ${b.name?.lastName || ''}`.trim()
    return scoreName(cleaned, bFull) - scoreName(cleaned, aFull)
  })[0]
  const fullName = `${best.name?.firstName || ''} ${best.name?.lastName || ''}`.trim() || 'Unknown'
  return { id: best.id, record: best, fullName }
}

/**
 * Resolve "the Prudential opportunity" / "Acme account" / "Joe Occhipinti"
 * to whatever record exists, with a preference order. Returns the FIRST
 * thing that matches so the caller can decide which kind of target to
 * link to (note/task can attach to companies/people/opportunities).
 */
export type AnyTarget =
  | { kind: 'opportunity'; id: string; name: string }
  | { kind: 'company'; id: string; name: string }
  | { kind: 'person'; id: string; name: string }
  | { kind: 'venue'; id: string; name: string }

export async function resolveAnyTarget(query: string): Promise<AnyTarget | null> {
  const cleaned = query.trim()
  if (!cleaned) return null

  // Try in priority order — opportunity first because callers usually
  // mean "the Prudential deal" rather than the company.
  const opp = await resolveOpportunity(cleaned)
  if (opp) return { kind: 'opportunity', id: opp.id, name: opp.record.name }

  const co = await resolveCompany(cleaned)
  if (co) return { kind: 'company', id: co.id, name: co.record.name }

  const ven = await resolveVenue(cleaned)
  if (ven) return { kind: 'venue', id: ven.id, name: ven.record.name }

  const person = await resolvePerson(cleaned)
  if (person) return { kind: 'person', id: person.id, name: person.fullName }

  return null
}
