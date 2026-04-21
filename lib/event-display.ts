export function formatVenueEventSummary(params: {
  summary: string | null | undefined
  eventType?: string | null
  venueType?: string | null
}): string {
  const summary = String(params.summary || '').trim()
  if (!summary) return ''
  if (params.eventType !== 'game') return summary
  if ((params.venueType || 'sports') !== 'sports') return summary

  const atMatch = summary.match(/^(.*?)(?:\s+at\s+)(.*)$/i)
  if (!atMatch) return summary

  const away = atMatch[1]?.trim()
  const home = atMatch[2]?.trim()
  if (!away || !home) return summary

  return `${home} vs ${away}`
}
