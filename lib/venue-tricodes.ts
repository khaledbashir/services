import { query } from '@/lib/db'

export function normalizeVenueTriCode(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const cleaned = value.toUpperCase().replace(/[^A-Z-]/g, '')
  const normalized = cleaned.split('-').slice(0, 2).map((part) => part.slice(0, 3)).join('-')
  return /^[A-Z]{1,3}(-[A-Z]{1,3})?$/.test(normalized) ? normalized : null
}

export async function resolveVenueIdFromTriCode(value: unknown): Promise<string | null> {
  const code = normalizeVenueTriCode(value)
  if (!code) return null

  const result = await query(
    `SELECT v.id
     FROM venues v
     WHERE EXISTS (
       SELECT 1
       FROM unnest(COALESCE(v.aliases, '{}'::text[])) alias(value)
       WHERE regexp_replace(upper(alias.value), '[^A-Z-]', '', 'g') = $1
     )
     ORDER BY v.name ASC
     LIMIT 1`,
    [code],
  )
  return result.rows[0]?.id || null
}
