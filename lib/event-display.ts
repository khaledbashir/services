export function formatVenueEventSummary(params: {
  summary: string | null | undefined
  eventType?: string | null
  venueType?: string | null
}): string {
  const summary = String(params.summary || '').trim()
  if (!summary) return ''
  if ((params.venueType || 'sports') !== 'sports') return summary
  if (params.eventType !== 'game' && !looksLikeSportsMatchup(summary)) return summary

  const atMatch = summary.match(/^(?:(.*?:)\s+)?(.+?)\s+at\s+(.+?)(\s+\(.*\)|\s+-.*|\s+Round.*|\s+Home Game.*|\s+Series Game.*)?$/i)
  if (!atMatch) return summary

  const prefix = atMatch[1]?.trim()
  const away = atMatch[2]?.trim()
  const home = atMatch[3]?.trim()
  const suffix = atMatch[4]?.trim()
  if (!away || !home) return summary

  return [prefix, `${home} vs ${away}`, suffix].filter(Boolean).join(' ')
}

function looksLikeSportsMatchup(summary: string): boolean {
  const lower = summary.toLowerCase()
  if (!/\sat\s/i.test(summary)) return false
  if (/(live at|tour|special guests|comedy|conference|celebration|job fair|presented by|presents)/i.test(summary)) {
    return false
  }
  return /(tbd|round|game|series|playoff|playoffs|wild card|home opener|semifinal|final|quarterfinal)/i.test(summary)
    || /^[^@]{2,80}\sat\s[^@]{2,80}$/i.test(summary)
}
