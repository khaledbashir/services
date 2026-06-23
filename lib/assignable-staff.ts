const ASSIGNABLE_PATTERNS = [
  '%design%',
  '%motion%',
  '%creative%',
  '%operator%',
  '%operations%',
  '%enterprise%',
  '%project%',
]

export function buildAssignableStaffWhere(assignable: string | null) {
  if (!assignable) return { clause: '', params: [] as string[] }

  const mode = assignable.toLowerCase()
  if (!['1', 'true', 'project', 'creative', 'design', 'cg', 'content'].includes(mode)) {
    return { clause: '', params: [] as string[] }
  }

  const params = [...ASSIGNABLE_PATTERNS]
  const patternChecks = params
    .map((_, idx) => {
      const slot = `$${idx + 1}`
      return `(COALESCE(title, '') ILIKE ${slot} OR COALESCE(full_name, '') ILIKE ${slot} OR COALESCE(email, '') ILIKE ${slot})`
    })
    .join(' OR ')

  return {
    clause: `
      WHERE COALESCE(is_active, true) = true
        AND (
          role IN ('admin', 'manager', 'tech_support')
          OR ${patternChecks}
        )
        AND COALESCE(full_name, '') !~* '(bot|agent|test)'
        AND COALESCE(email, '') !~* '(bot|agent|test|docs)'
    `,
    params,
  }
}
