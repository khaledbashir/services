/**
 * Which workflow completions reach whom, and down which channel.
 *
 * Joe 2026-08-17 asked to hear about completed steps — "can we have the check
 * in and post game report come to us?" — and on 2026-08-19, two days into
 * living with it: "I'm getting emails for check ins. Don't think that's
 * necessary."
 *
 * So a check-in is no longer worth an email to anyone, and no longer worth
 * telling ops leadership at all. It is still worth telling the venue's own
 * manager and lead field rep, because they are accountable for that building
 * and it reaches them as a Slack direct message — the channel Joe asked for the
 * same evening he asked about suggested events. Game-ready and the post-game
 * report are untouched: those are the ones carrying an incident, and they still
 * mail leadership.
 *
 * Deliberately free of imports so the rule is a pure function that can be
 * pinned by a test without booting the database or the Slack client.
 */

export type WorkflowStepType = 'check_in' | 'game_ready' | 'post_game_report'

export const WORKFLOW_STEPS: readonly WorkflowStepType[] = [
  'check_in',
  'game_ready',
  'post_game_report',
]

/** Every step tells the venue's own leads. */
const DEFAULT_NOTIFY_STEPS: readonly WorkflowStepType[] = WORKFLOW_STEPS

/** A check-in is not worth an email — Joe, 2026-08-19. */
const DEFAULT_EMAIL_STEPS: readonly WorkflowStepType[] = ['game_ready', 'post_game_report']

/** Nor is it worth telling ops leadership, who lead no single venue. */
const DEFAULT_ALWAYS_STEPS: readonly WorkflowStepType[] = ['game_ready', 'post_game_report']

export const NOTIFY_STEPS_SETTING = 'workflow_lead_notify_steps'
export const EMAIL_STEPS_SETTING = 'workflow_lead_notify_email_steps'
export const ALWAYS_STEPS_SETTING = 'workflow_lead_notify_always_steps'

export interface WorkflowNotifySettings {
  /** `workflow_lead_notify_steps` as stored, or null when the row is absent. */
  notifySteps?: string | null
  /** `workflow_lead_notify_email_steps` as stored, or null when absent. */
  emailSteps?: string | null
  /** `workflow_lead_notify_always_steps` as stored, or null when absent. */
  alwaysSteps?: string | null
}

export interface StepDelivery {
  /** Tell the venue's manager and lead field rep at all. */
  notifyLeads: boolean
  /** May a lead without a linked Slack account be emailed instead. */
  allowEmail: boolean
  /** Tell ops leadership, who hear about every venue. */
  notifyLeadership: boolean
}

/**
 * A missing row means "use the default". A row holding an empty string is a
 * deliberate opt-out and yields nobody — the same contract the ticket digests
 * and the walk-thru summary already use, so one setting behaves like the rest.
 */
export function parseStepList(
  raw: string | null | undefined,
  fallback: readonly WorkflowStepType[],
): Set<WorkflowStepType> {
  if (raw === null || raw === undefined) return new Set(fallback)
  if (raw.trim() === '') return new Set()

  const parsed = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s): s is WorkflowStepType => (WORKFLOW_STEPS as readonly string[]).includes(s))

  // A row naming only steps that no longer exist is a typo, not an opt-out —
  // falling back beats silently muting a post-game incident alert.
  return parsed.length > 0 ? new Set(parsed) : new Set(fallback)
}

export function resolveStepDelivery(
  step: WorkflowStepType,
  settings: WorkflowNotifySettings = {},
): StepDelivery {
  const notifyLeads = parseStepList(settings.notifySteps, DEFAULT_NOTIFY_STEPS).has(step)

  // A step nobody is told about cannot be told about by email either.
  if (!notifyLeads) {
    return { notifyLeads: false, allowEmail: false, notifyLeadership: false }
  }

  return {
    notifyLeads: true,
    allowEmail: parseStepList(settings.emailSteps, DEFAULT_EMAIL_STEPS).has(step),
    notifyLeadership: parseStepList(settings.alwaysSteps, DEFAULT_ALWAYS_STEPS).has(step),
  }
}
