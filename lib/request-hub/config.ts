// Request Hub — configuration layer.
// Everything the admin can change lives here as a typed default that can be
// overridden per-key from the request_hub_config table. Nothing about the
// intake (types, questions, statuses, rubric, routing, Slack mappings,
// notification rules) is hard-coded anywhere else — always go through
// getHubConfig().

import { query } from '@/lib/db'

export type HubQuestionInput = 'text' | 'textarea' | 'date' | 'select'

export interface HubQuestionCondition {
  key: string
  anyOf?: string[]
  notEmpty?: boolean
}

export interface HubQuestion {
  key: string
  label: string
  help?: string
  input: HubQuestionInput
  options?: string[]
  required?: boolean
  showIf?: HubQuestionCondition
}

export interface HubRequestType {
  key: string
  label: string
  description: string
  questions: HubQuestion[]
}

export interface HubStatus {
  key: string
  label: string
  accent: string // tailwind bg-* class for kanban dots / pills
  phase: 'intake' | 'decision' | 'delivery' | 'terminal'
}

export interface HubRubricLevel {
  key: string
  label: string
  description: string
}

export interface HubConfig {
  types: HubRequestType[]
  statuses: HubStatus[]
  rubric: {
    feasibility: HubRubricLevel[]
    effort: HubRubricLevel[]
    businessValue: HubRubricLevel[]
    confidence: HubRubricLevel[]
  }
  routing: {
    defaultOwnerId: string | null
    typeOwners: Record<string, string>
  }
  roles: {
    approvers: string[]
    assessors: string[]
    builders: string[]
  }
  slack: {
    intakeChannelId: string
    leadershipChannelId: string
    postOnSubmit: boolean
    dmRequester: boolean
  }
  notifications: {
    notifyOwnerOnAssign: boolean
    notifyRequesterOnDecision: boolean
    notifyRequesterOnComplete: boolean
    notifyThreadOnStatus: boolean
  }
  integrations: Record<string, { enabled: boolean; testMode: boolean }>
  responseTimeText: string
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const CORE_QUESTIONS: HubQuestion[] = [
  {
    key: 'want',
    label: 'What do you want?',
    help: 'Describe it the way you would to a colleague. Plain words are perfect.',
    input: 'textarea',
    required: true,
  },
  {
    key: 'problem',
    label: 'What problem does it solve?',
    help: 'What is hard, slow, or broken today without it?',
    input: 'textarea',
    required: true,
  },
  {
    key: 'beneficiaries',
    label: 'Who benefits?',
    help: 'Which people, teams, venues, or clients would use or feel this?',
    input: 'text',
  },
  {
    key: 'success',
    label: 'What would a successful result look like?',
    help: 'How will we know it worked?',
    input: 'textarea',
  },
  {
    key: 'deadline',
    label: 'Is there a real deadline?',
    help: 'Leave blank if there is no hard date.',
    input: 'date',
  },
  {
    key: 'deadline_reason',
    label: 'Why that date?',
    help: 'What happens on that date — an event, a launch, a contract?',
    input: 'text',
    showIf: { key: 'deadline', notEmpty: true },
  },
  {
    key: 'context',
    label: 'Which existing system, venue, account, or project is involved?',
    help: 'You can also attach records and links on the next step.',
    input: 'text',
  },
  {
    key: 'constraints',
    label: 'Anything that must not change?',
    help: 'Existing behavior, data, or workflows we need to leave exactly as they are.',
    input: 'textarea',
  },
]

function withCore(extra: HubQuestion[], overrides?: Partial<Record<string, Partial<HubQuestion>>>): HubQuestion[] {
  const core = CORE_QUESTIONS.map((q) => {
    const o = overrides?.[q.key]
    return o ? { ...q, ...o } : q
  })
  return [...extra, ...core]
}

export const DEFAULT_TYPES: HubRequestType[] = [
  {
    key: 'idea',
    label: 'New idea',
    description: 'Something we could do — not fully formed yet, and that is fine.',
    questions: withCore([], {
      want: { label: 'What is the idea?', help: 'A rough sketch is enough — the point is to capture it.' },
      success: { label: 'If this worked out, what changes?' },
    }),
  },
  {
    key: 'build',
    label: 'New build',
    description: 'A new tool, page, report, automation, or capability.',
    questions: withCore([]),
  },
  {
    key: 'change',
    label: 'Change to something existing',
    description: 'Adjust, extend, or improve something that already exists.',
    questions: withCore(
      [
        {
          key: 'target',
          label: 'What exactly should change?',
          help: 'Name the page, report, workflow, or feature as you know it.',
          input: 'text',
          required: true,
        },
      ],
      {
        want: { label: 'How should it work instead?' },
        problem: { label: 'What is wrong or missing today?' },
      }
    ),
  },
  {
    key: 'bug',
    label: 'Bug or problem',
    description: 'Something is broken, wrong, or not behaving the way it should.',
    questions: [
      {
        key: 'want',
        label: 'What is happening?',
        help: 'What did you see, and what did you expect to see instead?',
        input: 'textarea',
        required: true,
      },
      {
        key: 'where',
        label: 'Where does it happen?',
        help: 'Which page, report, or workflow — and for which venue or account, if it matters.',
        input: 'text',
        required: true,
      },
      {
        key: 'impact',
        label: 'How badly is it hurting?',
        input: 'select',
        options: ['Blocking work right now', 'There is a workaround, but it costs time', 'Annoying, not urgent'],
        required: true,
      },
      {
        key: 'repro',
        label: 'How can we make it happen?',
        help: 'Steps, an example record, or a screenshot all help.',
        input: 'textarea',
      },
      {
        key: 'constraints',
        label: 'Anything we should not touch while fixing it?',
        input: 'text',
      },
    ],
  },
]

export const DEFAULT_STATUSES: HubStatus[] = [
  { key: 'submitted', label: 'Submitted', accent: 'bg-sky-500', phase: 'intake' },
  { key: 'needs_clarification', label: 'Needs clarification', accent: 'bg-violet-500', phase: 'intake' },
  { key: 'feasibility', label: 'Feasibility assessment', accent: 'bg-cyan-500', phase: 'decision' },
  { key: 'leadership_review', label: 'Leadership review', accent: 'bg-amber-500', phase: 'decision' },
  { key: 'approved', label: 'Approved & queued', accent: 'bg-emerald-500', phase: 'delivery' },
  { key: 'in_progress', label: 'In progress', accent: 'bg-blue-500', phase: 'delivery' },
  { key: 'blocked', label: 'Blocked', accent: 'bg-red-500', phase: 'delivery' },
  { key: 'completed', label: 'Completed', accent: 'bg-emerald-600', phase: 'terminal' },
  { key: 'on_hold', label: 'On hold', accent: 'bg-zinc-400', phase: 'terminal' },
  { key: 'declined', label: 'Declined', accent: 'bg-zinc-500', phase: 'terminal' },
]

export const DEFAULT_RUBRIC: HubConfig['rubric'] = {
  feasibility: [
    { key: 'straightforward', label: 'Straightforward', description: 'Uses existing systems and patterns. No unknowns that change the shape of the work.' },
    { key: 'moderate', label: 'Moderate', description: 'Doable with known tools, but has open questions or touches several systems.' },
    { key: 'hard', label: 'Hard', description: 'Significant unknowns, new infrastructure, or external dependencies we do not control.' },
    { key: 'not_feasible', label: 'Not feasible as asked', description: 'Cannot be done as described — needs a different approach or is outside what our platforms can do.' },
  ],
  effort: [
    { key: 'xs', label: 'XS — under a day', description: 'A focused configuration or small fix.' },
    { key: 's', label: 'S — 1–3 days', description: 'A contained piece of work in one system.' },
    { key: 'm', label: 'M — 1–2 weeks', description: 'A real feature touching a few surfaces.' },
    { key: 'l', label: 'L — 2–6 weeks', description: 'A major build or cross-system change.' },
    { key: 'xl', label: 'XL — 6+ weeks', description: 'A program of work, likely phased.' },
  ],
  businessValue: [
    { key: 'critical', label: 'Critical', description: 'Revenue, a client commitment, or an operational failure depends on it.' },
    { key: 'high', label: 'High', description: 'Clearly saves meaningful time or strengthens a client relationship.' },
    { key: 'medium', label: 'Medium', description: 'Useful improvement; value is real but not urgent.' },
    { key: 'low', label: 'Low', description: 'Nice to have; value is speculative or narrow.' },
  ],
  confidence: [
    { key: 'high', label: 'High', description: 'The facts are verified and the estimate is based on comparable past work.' },
    { key: 'medium', label: 'Medium', description: 'Most facts are known; some assumptions still need checking.' },
    { key: 'low', label: 'Low', description: 'Key information is missing — treat the estimate as a first guess.' },
  ],
}

export const DEFAULT_CONFIG: HubConfig = {
  types: DEFAULT_TYPES,
  statuses: DEFAULT_STATUSES,
  rubric: DEFAULT_RUBRIC,
  routing: { defaultOwnerId: null, typeOwners: {} },
  roles: { approvers: [], assessors: [], builders: [] },
  slack: { intakeChannelId: '', leadershipChannelId: '', postOnSubmit: true, dmRequester: true },
  notifications: {
    notifyOwnerOnAssign: true,
    notifyRequesterOnDecision: true,
    notifyRequesterOnComplete: true,
    notifyThreadOnStatus: true,
  },
  integrations: {
    crm: { enabled: true, testMode: false },
    slack: { enabled: true, testMode: false },
    graph: { enabled: false, testMode: false },
    email_intake: { enabled: false, testMode: false },
  },
  responseTimeText: 'You will hear back within 2 business days.',
}

// ---------------------------------------------------------------------------
// DB-backed overrides
// ---------------------------------------------------------------------------

const CONFIG_KEYS = [
  'types',
  'statuses',
  'rubric',
  'routing',
  'roles',
  'slack',
  'notifications',
  'integrations',
  'responseTimeText',
] as const

export type HubConfigKey = (typeof CONFIG_KEYS)[number]

export function isHubConfigKey(key: string): key is HubConfigKey {
  return (CONFIG_KEYS as readonly string[]).includes(key)
}

export async function getHubConfig(): Promise<HubConfig> {
  const merged: HubConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG))
  try {
    const res = await query(`SELECT key, value FROM request_hub_config`)
    for (const row of res.rows) {
      if (isHubConfigKey(row.key) && row.value != null) {
        ;(merged as any)[row.key] = row.value
      }
    }
  } catch (err) {
    console.warn('[request-hub] config load failed, using defaults:', err)
  }
  return merged
}

export async function setHubConfigKey(
  key: HubConfigKey,
  value: unknown,
  actor: { userId?: string | null; fullName?: string | null }
): Promise<void> {
  await query(
    `INSERT INTO request_hub_config (key, value, updated_by, updated_by_name, updated_at)
     VALUES ($1, $2::jsonb, $3, $4, NOW())
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_by = $3, updated_by_name = $4, updated_at = NOW()`,
    [key, JSON.stringify(value), actor.userId || null, actor.fullName || null]
  )
}

export function statusByKey(config: HubConfig, key: string): HubStatus | undefined {
  return config.statuses.find((s) => s.key === key)
}

export function typeByKey(config: HubConfig, key: string): HubRequestType | undefined {
  return config.types.find((t) => t.key === key)
}

export function rubricLabel(levels: HubRubricLevel[], key: string | null | undefined): string {
  if (!key) return '—'
  return levels.find((l) => l.key === key)?.label || key
}
