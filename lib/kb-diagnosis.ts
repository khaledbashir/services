export const KB_ISSUE_TYPES = [
  'Dead Pixels',
  'Brightness Mismatch',
  'Color Shift',
  'Signal Loss',
  'Config Loss',
  'Cable Failure',
  'Module Failure',
  'Power Issue',
  'Software Glitch',
  'Scrambled Content',
  'Other',
] as const

export const KB_URGENCIES = ['Low', 'Medium', 'High', 'Critical'] as const

export type KBDiagnosis = {
  title: string
  issue_type: (typeof KB_ISSUE_TYPES)[number]
  description: string
  likely_cause: string
  suggested_fix: string
  urgency: (typeof KB_URGENCIES)[number]
}

function cleanText(value: unknown, maxLength: number): string {
  if (Array.isArray(value)) value = value.join(' ')
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function canonicalValue<T extends readonly string[]>(value: unknown, allowed: T): T[number] | null {
  const text = cleanText(value, 80).toLowerCase()
  return allowed.find(item => {
    const canonical = item.toLowerCase()
    return text === canonical ||
      text.startsWith(`${canonical} (`) ||
      text.startsWith(`${canonical} -`) ||
      text.startsWith(`${canonical}:`)
  }) || null
}

/**
 * The diagnostics card is actionable only when every displayed field is
 * substantive. Reject partial/truncated model output so the provider chain can
 * retry instead of rendering an empty Suggested Fix or half-written cause.
 */
export function normalizeKBDiagnosis(value: unknown): KBDiagnosis | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const title = cleanText(candidate.title, 120)
  const description = cleanText(candidate.description, 600)
  const likelyCause = cleanText(candidate.likely_cause, 500)
  const suggestedFix = cleanText(candidate.suggested_fix, 1200)
  const issueType = canonicalValue(candidate.issue_type, KB_ISSUE_TYPES)
  const urgency = canonicalValue(candidate.urgency, KB_URGENCIES)

  if (
    title.length < 3 ||
    description.length < 20 ||
    likelyCause.length < 12 ||
    suggestedFix.length < 20 ||
    !issueType ||
    !urgency
  ) {
    return null
  }

  return {
    title,
    issue_type: issueType,
    description,
    likely_cause: likelyCause,
    suggested_fix: suggestedFix,
    urgency,
  }
}

export function extractKBDiagnosis(text: string): KBDiagnosis | null {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonMatch = (codeBlock?.[1] || text).match(/\{[\s\S]*\}/)
  const jsonText = (jsonMatch?.[0] || codeBlock?.[1] || text).trim()

  const attempts = [
    jsonText,
    jsonText.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']'),
  ]

  const openBraces = (jsonText.match(/\{/g) || []).length
  const closeBraces = (jsonText.match(/}/g) || []).length
  if (openBraces > closeBraces) {
    let closed = jsonText
    if ((closed.match(/"/g) || []).length % 2 !== 0) closed += '"'
    closed += '}'.repeat(openBraces - closeBraces)
    attempts.push(closed)
  }

  for (const attempt of attempts) {
    try {
      const normalized = normalizeKBDiagnosis(JSON.parse(attempt))
      if (normalized) return normalized
    } catch {
      // Try the next recovery shape.
    }
  }

  const field = (name: string) => text.match(new RegExp(`"${name}"\\s*:\\s*"([^"]*)"`))?.[1] || ''
  return normalizeKBDiagnosis({
    title: field('title'),
    issue_type: field('issue_type'),
    description: field('description'),
    likely_cause: field('likely_cause'),
    suggested_fix: field('suggested_fix'),
    urgency: field('urgency'),
  })
}
