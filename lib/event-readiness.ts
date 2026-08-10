/**
 * Client-facing game-day progress for an event (Charlie 2026-08-10).
 *
 * ANC's internal panel shows three workflow submissions plus who filed each
 * one, extra timesheets and the auditor. Clients get the three milestones and
 * their timestamps only — the identity of the technician and the contents of
 * the submission stay internal.
 */

export type ReadinessStepKey = 'check_in' | 'game_ready' | 'post_game_report'

export interface ReadinessSubmission {
  type: string
  submitted_at: string | Date
}

export interface ReadinessStep {
  key: ReadinessStepKey
  label: string
  complete: boolean
  completed_at: string | null
}

export interface EventReadiness {
  steps: ReadinessStep[]
  /** Milestones completed, for a compact "2 of 3" summary. */
  completed: number
  total: number
  /** Plain-language state for the badge. */
  label: string
}

const STEPS: Array<{ key: ReadinessStepKey; label: string }> = [
  { key: 'check_in', label: 'Checked in' },
  { key: 'game_ready', label: 'Game ready' },
  { key: 'post_game_report', label: 'Post-game complete' },
]

export function buildEventReadiness(submissions: ReadinessSubmission[]): EventReadiness {
  // Keep the earliest submission per milestone: several technicians can file
  // the same step, and the client should see when it was first satisfied.
  // Normalise every timestamp to ISO before comparing. The driver returns Date
  // objects while fixtures and JSON payloads carry strings, and comparing the
  // two shapes lexically would pick the wrong "earliest".
  const earliest = new Map<string, string>()
  for (const submission of submissions) {
    const parsed = new Date(submission.submitted_at)
    if (Number.isNaN(parsed.getTime())) continue
    const at = parsed.toISOString()
    const current = earliest.get(submission.type)
    if (!current || at < current) earliest.set(submission.type, at)
  }

  const steps: ReadinessStep[] = STEPS.map(({ key, label }) => ({
    key,
    label,
    complete: earliest.has(key),
    completed_at: earliest.get(key) ?? null,
  }))

  const completed = steps.filter((step) => step.complete).length
  const label = completed === 0
    ? 'Not started'
    : completed === STEPS.length
      ? 'Complete'
      : steps.filter((s) => s.complete).slice(-1)[0].label

  return { steps, completed, total: STEPS.length, label }
}
