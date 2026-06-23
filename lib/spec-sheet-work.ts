export const SPEC_SHEET_INTERNAL_CATEGORY = 'spec_sheets'

const SPEC_SHEET_RE = /\bspec\s*sheet(s)?\b/i

export function isSpecSheetWork(...values: Array<string | null | undefined>) {
  return values.some((value) => SPEC_SHEET_RE.test(String(value || '')))
}

export const SPEC_SHEET_PRINT_SQL = `
  (
    COALESCE(job_title, '') ILIKE '%spec sheet%'
    OR COALESCE(client_name, '') ILIKE '%spec sheet%'
    OR COALESCE(notes, '') ILIKE '%spec sheet%'
  )
`

export const SPEC_SHEET_PRINT_SQL_WITH_ALIAS = (alias: string) => `
  (
    COALESCE(${alias}.job_title, '') ILIKE '%spec sheet%'
    OR COALESCE(${alias}.client_name, '') ILIKE '%spec sheet%'
    OR COALESCE(${alias}.notes, '') ILIKE '%spec sheet%'
  )
`
