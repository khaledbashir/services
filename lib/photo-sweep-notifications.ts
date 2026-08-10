/**
 * Photo filing is intentionally quiet in venue channels. Operators can route
 * one roll-up to the explicitly configured Services notification channel, but
 * a fleet sweep must never fan confirmation messages back into every venue.
 */
export function buildPhotoSweepSummary(
  filed: number,
  venuesFiled: number,
  sharedFolderUrl: string,
): string {
  const destination = sharedFolderUrl.trim()
  const link = destination ? ` → ${destination}` : ''
  return `📸 Weekly photo sweep: filed ${filed} technician photos from ${venuesFiled} venues to the shared Sales library${link}`
}
