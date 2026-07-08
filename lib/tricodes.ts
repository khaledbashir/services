// ── Tri-code enumeration (client-safe) ────────────────────────────────────────
// Tri-codes live inside each venue's `aliases TEXT[]` array (there is no
// dedicated tri-codes table). That array intentionally mixes real tri-codes
// (BSX-FEN, FEN) with team-name aliases, and free-text entry across forms means
// the same code can appear with different case/whitespace.
//
// Every surface that offers a tri-code picker (design requests, hours budgets)
// MUST enumerate through here so the list is complete (all of a venue's codes,
// never collapsed to one) and de-duplicated (case/whitespace variants fold into
// a single canonical code). This is the fix for Alexis's "some tri-codes missing
// and others duplicated" note.

// Canonical form: up to two 3-letter segments, uppercase, hyphen-joined.
export function normalizeTriCode(value: string): string {
  const cleaned = (value || '').toUpperCase().replace(/[^A-Z-]/g, '')
  return cleaned.split('-').slice(0, 2).map((p) => p.slice(0, 3)).join('-')
}

const TRI_CODE_SHAPE = /^[A-Z]{1,3}(-[A-Z]{1,3})?$/

export function isTriCodeShaped(code: string): boolean {
  return TRI_CODE_SHAPE.test(code)
}

// All distinct, tri-code-shaped codes for a single venue's aliases — deduped
// case-insensitively, sorted for a stable dropdown order.
export function venueTriCodes(aliases: string[] | null | undefined): string[] {
  const seen = new Set<string>()
  for (const raw of aliases || []) {
    const code = normalizeTriCode(raw)
    if (TRI_CODE_SHAPE.test(code)) seen.add(code)
  }
  return Array.from(seen).sort()
}

// Union of every venue's tri-codes — used when no venue is selected so the
// picker can still offer the full deduped catalog.
export function allTriCodes(venues: Array<{ aliases?: string[] | null }> | null | undefined): string[] {
  const seen = new Set<string>()
  for (const v of venues || []) {
    for (const code of venueTriCodes(v.aliases)) seen.add(code)
  }
  return Array.from(seen).sort()
}
