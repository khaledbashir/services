/**
 * Proof URL shape checks.
 *
 * Deliberately dependency-free so both the server (API routes) and the client
 * ticket UI can import it — `lib/proof-share.ts` pulls in `node:crypto` and
 * cannot be bundled for the browser.
 */

/**
 * True when a URL is one of OUR managed proof pages (`/proof/<token>`).
 *
 * Load-bearing: once a managed share is minted, the ticket's `ftp_proof_link`
 * column stops being "where the proof lives" and becomes "the page that shows
 * the proof". Anything that treats that column as a *source* of proof files
 * has to exclude managed URLs first, or it renders a link that points back at
 * the page the reader is already on. Matched on the path only, so it holds
 * across the prod host, the EasyPanel host and localhost.
 */
export function isManagedProofUrl(value: string | null | undefined): boolean {
  if (!value) return false
  try {
    return /^\/proof\/[A-Za-z0-9_-]+\/?$/.test(new URL(value).pathname)
  } catch {
    return false
  }
}

/**
 * The pre-dashboard client link for a ticket, or null when it has none.
 *
 * Two shapes exist in the wild and both must work:
 *   - converted tickets  — workspace URL moved to `legacy_ftp_proof_link`,
 *     `ftp_proof_link` now holds the managed page's own URL
 *   - unconverted ones   — workspace URL still sitting in `ftp_proof_link`
 *
 * The managed-URL filter is the whole point: without it the second candidate
 * resolves to the proof page itself, and a proof with no files renders a card
 * that links to the page the client is already on. That is what made an empty
 * proof read as "expired" (Citizens Bank 2026, reported 2026-08-24).
 */
export function selectLegacyProofUrl(
  legacyProofLink: string | null | undefined,
  currentProofLink: string | null | undefined
): string | null {
  return (
    [legacyProofLink, currentProofLink].find(
      (candidate) => candidate && !isManagedProofUrl(candidate)
    ) || null
  )
}
