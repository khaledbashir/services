export type AhmadSyncSlackKind = 'request_received' | 'shipped'

const REQUEST_PATTERNS = [
  /\bcan you\b/i,
  /\bcould you\b/i,
  /\bwould you\b/i,
  /\bplease\b/i,
  /\bneed(?:s|ed)? (?:you|this|that|the|a|an|to)\b/i,
  /\bnot working\b/i,
  /\bdoesn['’]?t work\b/i,
  /\bbroken\b/i,
  /\bmissing\b/i,
  /\bfix\b/i,
  /\badd\b/i,
  /\bupdate\b/i,
  /\bchange\b/i,
  /\bexport\b/i,
  /\breport\b/i,
  /\bconfirm\b/i,
]

const SHIPPED_PATTERNS = [
  /^\s*(?:hi\s+\w+[—,:-]?\s*)?(?:fixed|shipped|deployed|updated|sorted|ready|live)\b/i,
  /\b(?:is|it['’]?s|now) live\b/i,
  /\b(?:is|it['’]?s) fixed\b/i,
  /\bverified (?:live|in production)\b/i,
]

const NEGATED_COMPLETION = /\b(?:not|isn['’]?t|wasn['’]?t|aren['’]?t)\s+(?:done|fixed|live|ready|shipped|deployed)\b/i

function enabled(): boolean {
  return !['false', '0', 'off', 'no'].includes((process.env.AHMAD_SYNC_SLACK_ENABLED || 'true').trim().toLowerCase())
}

function looksLikeRequest(text: string): boolean {
  return REQUEST_PATTERNS.some((pattern) => pattern.test(text))
}

export function classifyAhmadSyncSlackMessage(event: any): AhmadSyncSlackKind | null {
  if (!enabled() || !event || event.subtype === 'bot_message' || event.bot_id) return null
  if (!['message', 'app_mention'].includes(String(event.type || ''))) return null
  const text = typeof event.text === 'string' ? event.text.trim() : ''
  if (!text) return null

  const ahmadSlackId = (process.env.AHMAD_SYNC_AHMAD_SLACK_USER_ID || 'U0A92M2DA13').trim()
  if (String(event.user || '') === ahmadSlackId) {
    if (NEGATED_COMPLETION.test(text)) return null
    return SHIPPED_PATTERNS.some((pattern) => pattern.test(text)) ? 'shipped' : null
  }

  return looksLikeRequest(text) ? 'request_received' : null
}
