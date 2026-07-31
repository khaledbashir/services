/**
 * Narrow a customer portal's authorized venue grants to the venue selected in
 * the global shell. Unknown ids always resolve to an empty scope.
 */
export function scopePortalVenueIds(
  venueIds: string[],
  requestedVenueId?: string | null
): string[] {
  const requested = requestedVenueId?.trim() || ''
  if (!requested || requested === 'all') return venueIds
  return venueIds.includes(requested) ? [requested] : []
}
