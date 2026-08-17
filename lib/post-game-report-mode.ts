/**
 * Who owes a post-game report for an event.
 *
 * Charlie 2026-08-17: "Events - ability to choose if everyone needs to submit a
 * post-game report or just one."
 *
 *   'one'      — one report closes out the event for the whole crew. This is
 *                what every event did before the setting existed, so it stays
 *                the default and nothing changes for venues that don't touch it.
 *   'everyone' — every assigned technician submits their own, and the event is
 *                not complete until they all have.
 *
 * The venue carries the default and an event may override it, mirroring how
 * venues.requires_assignment / events.requires_staffing already work.
 */
export type PostGameReportMode = 'one' | 'everyone'

export const POST_GAME_REPORT_MODES: PostGameReportMode[] = ['one', 'everyone']

export const DEFAULT_POST_GAME_REPORT_MODE: PostGameReportMode = 'one'

export const POST_GAME_REPORT_MODE_LABELS: Record<PostGameReportMode, string> = {
  one: 'One report for the event',
  everyone: 'Every assigned technician submits',
}

export function isPostGameReportMode(value: unknown): value is PostGameReportMode {
  return typeof value === 'string' && (POST_GAME_REPORT_MODES as string[]).includes(value)
}

/** Coerce a stored/incoming value, falling back to the default. */
export function normalizePostGameReportMode(value: unknown): PostGameReportMode {
  return isPostGameReportMode(value) ? value : DEFAULT_POST_GAME_REPORT_MODE
}

/**
 * Event override wins; otherwise the venue default; otherwise 'one'.
 * An unset event override is null, which is different from an event that has
 * explicitly been set back to 'one'.
 */
export function resolvePostGameReportMode(
  eventMode: unknown,
  venueMode: unknown
): PostGameReportMode {
  if (isPostGameReportMode(eventMode)) return eventMode
  return normalizePostGameReportMode(venueMode)
}
