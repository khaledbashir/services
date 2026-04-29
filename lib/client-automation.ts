// Joe's 2026-04-29 follow-up retired the contracted-services-driven staffing
// inference. The venue-level `requires_assignment` toggle is now the single
// source of truth (per-event overrides via `events.requires_staffing`). This
// helper stays as a no-op shim so existing call sites keep compiling, but it
// always returns true so the venue toggle ends up being the gate.
export function buildClientServiceSelect(
  aliasCs: string,
  aliasSt: string,
): string {
  return `
    COUNT(DISTINCT CASE WHEN ${aliasCs}.enabled = true THEN ${aliasSt}.id END)::int as active_service_count,
    COALESCE(array_remove(array_agg(DISTINCT CASE WHEN ${aliasCs}.enabled = true THEN ${aliasSt}.name END), NULL), '{}') as active_service_names,
    COALESCE(array_remove(array_agg(DISTINCT CASE WHEN ${aliasCs}.enabled = true THEN COALESCE(${aliasSt}.description, '') END), NULL), '{}') as active_service_descriptions
  `
}
