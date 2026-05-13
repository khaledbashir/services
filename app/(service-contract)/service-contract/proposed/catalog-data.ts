// All catalog content lives here so prices/copy are editable in ONE place.
// Edit numbers + bullets without hunting through React components.

export type TierKey = 'steady' | 'active' | 'operator-plus'
export type OperatorKey = 'basic' | 'full'
export type BucketKey = 'xs' | 's' | 'm' | 'l' | 'xl'
export type BundleKey = 'a' | 'b' | 'c'

export interface ServiceTier {
  key: TierKey
  name: string
  monthly: number
  annual: number
  hours: number
  effectiveRate: number
  responseSla: string
  recommended?: boolean
  tagline: string
  perks: string[]
  best_for: string
}

export const SERVICE_TIERS: ServiceTier[] = [
  {
    key: 'steady',
    name: 'Steady',
    monthly: 1500,
    annual: 18000,
    hours: 12,
    effectiveRate: 125,
    responseSla: '24h, Mon–Fri',
    tagline: 'Anchor tier · platforms stay running',
    best_for: 'Steady-state quarters with light activity',
    perks: [
      '12 hours of maintenance per month',
      'Bug fixes on shipped functionality',
      'Server health, restarts, log review',
      'Operator support over Slack',
      '30-day warranty on every ship',
      'Overage at $90/hr if needed',
    ],
  },
  {
    key: 'active',
    name: 'Active',
    monthly: 3000,
    annual: 36000,
    hours: 30,
    effectiveRate: 100,
    responseSla: '24h, Mon–Fri',
    tagline: 'Sweet spot · 25% better per-hour rate',
    best_for: 'Realistic monthly cadence for ANC (~25h observed in May)',
    perks: [
      '30 hours of maintenance per month',
      '+ 4 hours of build credits for small new features',
      'Everything in Steady',
      'Same response SLA',
      'Overage at $85/hr',
    ],
  },
  {
    key: 'operator-plus',
    name: 'Operator+',
    monthly: 4500,
    annual: 54000,
    hours: 50,
    effectiveRate: 72,
    responseSla: 'Same-day, Mon–Fri',
    recommended: true,
    tagline: 'Highest-coverage tier · predictable support capacity',
    best_for: 'Teams that want one monthly operating plan with fewer surprise approvals',
    perks: [
      '50 hours of maintenance per month',
      '12 hours of build credits / month (roll over up to 24h)',
      'Same-day response SLA',
      'Charlie operator-training: 1 session/month',
      'Discounted operator-training renewal option',
      'Enterprise-grade transparency dashboard',
      'Overage at $75/hr',
    ],
  },
]

export interface OperatorOption {
  key: OperatorKey
  name: string
  price: number
  tagline: string
  description: string
  includes: string[]
  excludes?: string[]
}

export const OPERATOR_PROGRAM: OperatorOption[] = [
  {
    key: 'basic',
    name: 'Charlie Basic',
    price: 4000,
    tagline: 'Operator preparation · first-line support',
    description: 'Prepares Charlie to support running platforms. UI-level configuration + log reading + top-20 incident playbook.',
    includes: [
      '8 working sessions over 6 weeks (60–90 min each)',
      'How to navigate and explain the 4 platforms to ANC users',
      'Routine UI configuration inside admin panels',
      'Server health checks, log reading, restart procedures',
      'Top 20 recurring issues + how to handle them',
      'Hands-on shadow access during real fixes',
      'Operator handbook at the end',
    ],
    excludes: [
      'AI toolkit (covered in Full)',
      'Custom agent / prompt library configurations',
      'Reusable engineering artifacts beyond the handbook',
    ],
  },
  {
    key: 'full',
    name: 'Charlie Full Operator',
    price: 18000,
    tagline: 'Train Charlie to operate the full stack',
    description: 'Operator preparation plus the AI-assisted platform workflow. After this Charlie can support fixes and scoped improvements in-house with a controlled process.',
    includes: [
      'Everything in Basic',
      'AI-assisted operating toolkit configured on Charlie\'s workstation',
      'Agent skills, prompt libraries, model routing, and verification workflow',
      'Dev + deploy workflow for controlled fixes and scoped improvements',
      'Custom agent configurations for all 4 platforms',
      'Methodology: how to brief, verify, ship, and roll back AI work',
      '30-day extended Q&A window after program completion',
      'Operator handbook + AI-assisted workflow playbook',
    ],
  },
]

export interface Bucket {
  key: BucketKey
  name: string
  hoursRange: string
  price: number
  priceLabel: string
  fits: string[]
  examples: string[]
}

export const BUILD_BUCKETS: Bucket[] = [
  {
    key: 'xs',
    name: 'XS — Tweak',
    hoursRange: '0.5–1h',
    price: 250,
    priceLabel: '$250',
    fits: ['Field rename', 'New filter or saved view', 'Copy fix', 'Small config change', 'Quick formula tweak'],
    examples: ['Priority flag toggle fix', 'Hours-budget "Unlimited" mode', 'Slack alert wording update'],
  },
  {
    key: 's',
    name: 'S — Small Build',
    hoursRange: '1–3h',
    price: 750,
    priceLabel: '$750',
    fits: ['One new form field', 'Single automation', 'Slack message format', 'Mini-report or widget', 'New webhook'],
    examples: ['CG fields on design requests', 'Comment thread on tickets', '@mention assigned staff in Slack alerts'],
  },
  {
    key: 'm',
    name: 'M — Medium Build',
    hoursRange: '4–8h',
    price: 2000,
    priceLabel: '$2,000',
    fits: ['New report or dashboard view', 'New AI agent skill', 'End-to-end automation', 'Multi-field feature in existing module'],
    examples: ['Designs-by-client report', 'AnythingLLM custom skill', 'Plan-mode prompt + audit-recipe launcher'],
  },
  {
    key: 'l',
    name: 'L — Large Build',
    hoursRange: '10–16h',
    price: 4500,
    priceLabel: '$4,500',
    fits: ['New module or page', 'Multi-stakeholder feature', 'External integration', 'Schema change + UI'],
    examples: ['Transparency dashboard', 'Expenses module', 'Public proof-share with token approval'],
  },
  {
    key: 'xl',
    name: 'XL — Phase',
    hoursRange: '24h+',
    price: 0,
    priceLabel: '$8K – $15K (scoped)',
    fits: ['New subsystem', 'Multi-module integration', 'Data migration', 'Cross-platform feature'],
    examples: ['Native Airtable engine', 'Wrike → Twenty migration', 'Twenty CRM sync layer'],
  },
]

export interface Bundle {
  key: BundleKey
  name: string
  tier: TierKey
  operator: OperatorKey | null
  separately: number
  bundlePrice: number
  saves: number
  badge?: string
  tagline: string
  highlights: string[]
}

export const BUNDLES: Bundle[] = [
  {
    key: 'a',
    name: 'Steady Path',
    tier: 'steady',
    operator: 'basic',
    separately: 22000,
    bundlePrice: 22000,
    saves: 0,
    tagline: 'Light support + Charlie ramped to first line',
    highlights: [
      '12h maintenance / month',
      'Charlie trained as first-line supporter',
      'Clean add-on, no bundle discount',
    ],
  },
  {
    key: 'b',
    name: 'Active Path',
    tier: 'active',
    operator: 'full',
    separately: 54000,
    bundlePrice: 48000,
    saves: 6000,
    tagline: 'Real cadence covered + full operator transfer',
    highlights: [
      '30h maintenance + 4h build / month',
      'Charlie Full Operator — full toolkit transfer',
      '$6,000 off the retainer side for committing',
    ],
  },
  {
    key: 'c',
    name: 'Operator+ Path',
    tier: 'operator-plus',
    operator: 'full',
    separately: 72000,
    bundlePrice: 54000,
    saves: 18000,
    badge: 'Best Value',
    tagline: 'Highest coverage · operator training included',
    highlights: [
      '50h maintenance + 12h build / month',
      'Same-day SLA',
      'Charlie Full Operator included as part of the annual package',
      'Quarterly Charlie training sessions',
      'Discounted operator-training renewal option',
    ],
  },
]

export interface ForecastLine {
  label: string
  yearOneCost: number
  recurring: number
}

export const FORECAST_BY_BUNDLE: Record<BundleKey, ForecastLine[]> = {
  a: [
    { label: 'Steady retainer', yearOneCost: 18000, recurring: 18000 },
    { label: 'Charlie Basic (one-time)', yearOneCost: 4000, recurring: 0 },
    { label: '~2 L builds / year (outside credits)', yearOneCost: 9000, recurring: 9000 },
    { label: '~12 M builds / year', yearOneCost: 24000, recurring: 24000 },
    { label: '~25 S/XS builds / year', yearOneCost: 6000, recurring: 6000 },
  ],
  b: [
    { label: 'Active retainer', yearOneCost: 36000, recurring: 36000 },
    { label: 'Charlie Full Operator', yearOneCost: 18000, recurring: 0 },
    { label: 'Bundle B discount', yearOneCost: -6000, recurring: 0 },
    { label: '~2 L builds / year (outside credits)', yearOneCost: 9000, recurring: 9000 },
    { label: '~6 M builds / year (rest absorbed)', yearOneCost: 12000, recurring: 12000 },
  ],
  c: [
    { label: 'Operator+ retainer', yearOneCost: 54000, recurring: 54000 },
    { label: 'Charlie Full Operator (included)', yearOneCost: 0, recurring: 0 },
    { label: '~2 L builds / year (outside credits)', yearOneCost: 9000, recurring: 9000 },
    { label: '~3 M builds / year (rest absorbed by credits)', yearOneCost: 6000, recurring: 6000 },
    { label: 'XS / S builds — fully absorbed', yearOneCost: 0, recurring: 0 },
  ],
}

// Real history snapshot (last 6 months across all 4 repos)
export const HISTORY_STATS = {
  windowLabel: 'Last 6 months · 4 platforms',
  totalCommits: 3131,
  ancServicesFeatCommits: 77,
  ancServicesFixCommits: 74,
  distinctFeatureAreas: 25,
  shipsPerMonthAvg: 25,
  newFeaturesPerMonthAvg: 4,
  bucketDistribution: {
    xs: 30, // % of all shipped work that lands in XS
    s: 35,
    m: 22,
    l: 10,
    xl: 3,
  },
}

export const TIER_BY_KEY = Object.fromEntries(SERVICE_TIERS.map(t => [t.key, t])) as Record<TierKey, ServiceTier>
export const OPERATOR_BY_KEY = Object.fromEntries(OPERATOR_PROGRAM.map(o => [o.key, o])) as Record<OperatorKey, OperatorOption>
export const BUNDLE_BY_KEY = Object.fromEntries(BUNDLES.map(b => [b.key, b])) as Record<BundleKey, Bundle>

// ─────────────────────────────────────────────────────────────────────────────
// PLAN BUILDER — interactive hour slider with volume discounts and unlocks.
// Base rate is $90/hr. Each hour band drops the rate; each unlock threshold
// activates a perk. This is the "build your own plan" experience.
// ─────────────────────────────────────────────────────────────────────────────

export const BASE_RATE = 90

export interface HourBand {
  minHours: number
  rate: number
  badge: string
  emoji: string
  tagline: string
  color: string // tailwind accent
}

export const HOUR_BANDS: HourBand[] = [
  { minHours: 1,  rate: 90, badge: 'Starter',    emoji: '🌱', tagline: 'Anchor rate · pay-as-you-go feel',    color: 'slate' },
  { minHours: 9,  rate: 80, badge: 'Engaged',    emoji: '⚡', tagline: 'Volume discount kicks in',           color: 'blue' },
  { minHours: 21, rate: 70, badge: 'Active',     emoji: '🔥', tagline: 'Most ANC months land here',          color: 'indigo' },
  { minHours: 41, rate: 60, badge: 'Operator',   emoji: '🚀', tagline: 'Heavy-build cadence',                color: 'purple' },
  { minHours: 60, rate: 50, badge: 'Enterprise', emoji: '👑', tagline: 'Custom enterprise tier — talk to us', color: 'emerald' },
]

export interface Unlock {
  atHours: number
  label: string
  description: string
  icon: string
  worth?: string
}

export const UNLOCKS: Unlock[] = [
  { atHours: 12, label: 'Maintenance retainer activates',  description: 'Bug fixes + ops support across all 4 platforms', icon: '🔧' },
  { atHours: 20, label: 'Same-day SLA',                    description: 'Mon–Fri response in hours, not next-day',         icon: '⚡' },
  { atHours: 30, label: 'Build credits unlock',            description: '4 hours/mo of NEW feature work, no extra invoice', icon: '🔨', worth: '+$2K value/mo' },
  { atHours: 40, label: 'Operator training included',      description: 'Quarterly Charlie hands-on session',              icon: '🎓' },
  { atHours: 50, label: 'Charlie Full Operator INCLUDED',  description: 'Full toolkit transfer to Charlie — bundled in',   icon: '🎁', worth: '$18,000 of value' },
  { atHours: 60, label: 'Half-off Year-2 renewal',         description: 'Lock the rate going forward',                     icon: '💎' },
]

// ─────────────────────────────────────────────────────────────────────────────
// AI SCOPING JOURNEY — idea seeds + clarifying-question patterns
// Pre-baked starter ideas that match real ANC pattern history. They power the
// "Idea Suggestions" panel — filter live as the user types, click to fill.
// ─────────────────────────────────────────────────────────────────────────────

export interface IdeaSeed {
  id: string
  emoji: string
  title: string
  description: string
  bucket: BucketKey
  platforms: string[] // service-dashboard, crm, proposal-engine, docs
  keywords: string[]  // for fuzzy match
}

export const IDEA_SEEDS: IdeaSeed[] = [
  {
    id: 'nielsen-auto-pull',
    emoji: '📺',
    title: 'Nielsen auto-pull for M&S verification',
    description: 'Pull TRUE/FALSE broadcast confirmations directly into each sponsor\'s Nielsen verification grid. Stop the monthly manual export.',
    bucket: 'l',
    platforms: ['crm'],
    keywords: ['nielsen', 'broadcast', 'verification', 'sponsor', 'pull', 'integration'],
  },
  {
    id: 'venue-tree-design',
    emoji: '🌳',
    title: 'Venue tree on design requests',
    description: 'Pick a parent venue and see every sub-venue (boards, ribbons, fascias) tree-style when filing a design request.',
    bucket: 'm',
    platforms: ['service-dashboard'],
    keywords: ['venue', 'tree', 'design', 'hierarchy', 'parent', 'sub-venue'],
  },
  {
    id: 'stakeholder-dashboard',
    emoji: '📊',
    title: 'Per-stakeholder CRM dashboard',
    description: 'One landing page per stakeholder (Joe / Jireh / Natalia) — pinned reports, KPIs, and recent activity they care about.',
    bucket: 'l',
    platforms: ['crm'],
    keywords: ['stakeholder', 'dashboard', 'kpi', 'natalia', 'jireh', 'joe', 'pinned'],
  },
  {
    id: 'salesforce-account-sync',
    emoji: '🔄',
    title: 'Salesforce → CRM account sync',
    description: 'Two-way sync for Accounts and Opportunities so legacy SF reports keep working while the new CRM becomes the source of truth.',
    bucket: 'xl',
    platforms: ['crm'],
    keywords: ['salesforce', 'sf', 'sync', 'account', 'opportunity', 'migration'],
  },
  {
    id: 'service-log-pdf',
    emoji: '📄',
    title: 'Service-log monthly PDF report',
    description: 'Auto-generate a polished PDF every month with shipped items, hours used, retainer remaining — branded and emailable.',
    bucket: 'm',
    platforms: ['service-dashboard'],
    keywords: ['pdf', 'report', 'monthly', 'service-log', 'export', 'invoice'],
  },
  {
    id: 'designer-utilization',
    emoji: '🎨',
    title: 'Designer utilization heatmap',
    description: 'Calendar heatmap per designer — who\'s overloaded, who has bandwidth, color-coded by hours-budget burn.',
    bucket: 'm',
    platforms: ['service-dashboard'],
    keywords: ['designer', 'utilization', 'heatmap', 'hours', 'budget', 'capacity'],
  },
  {
    id: 'voicemail-auto-ticket',
    emoji: '📞',
    title: 'Voicemail → ticket auto-route',
    description: 'Inbound voicemail transcribed, classified, and dropped into the right venue ticket queue with a Slack alert.',
    bucket: 'l',
    platforms: ['service-dashboard'],
    keywords: ['voicemail', 'phone', 'transcribe', 'ticket', 'auto', 'route'],
  },
  {
    id: 'proposal-template-library',
    emoji: '📚',
    title: 'Proposal template library',
    description: 'Reusable Mirror-Mode templates per stadium type (NBA arena / NFL stadium / college). One-click clone for new RFPs.',
    bucket: 'l',
    platforms: ['proposal-engine'],
    keywords: ['proposal', 'template', 'mirror', 'rfp', 'library', 'clone'],
  },
  {
    id: 'inventory-low-stock',
    emoji: '📦',
    title: 'Inventory low-stock alerts',
    description: 'Slack ping the moment any spare-parts SKU drops below the per-venue threshold. Surface in the maintenance queue.',
    bucket: 's',
    platforms: ['service-dashboard'],
    keywords: ['inventory', 'parts', 'stock', 'alert', 'slack', 'maintenance'],
  },
  {
    id: 'walkthrough-mobile',
    emoji: '📱',
    title: 'Mobile walkthrough form',
    description: 'Field-staff walkthrough form optimized for phones: photo upload, GPS-tagged, offline-capable, syncs when reconnected.',
    bucket: 'l',
    platforms: ['service-dashboard'],
    keywords: ['mobile', 'walkthrough', 'field', 'photo', 'offline', 'phone'],
  },
  {
    id: 'docs-search',
    emoji: '🔎',
    title: 'AI-powered operator docs search',
    description: 'Natural-language search over operator docs — ask "how do I add a venue" and get the exact section + step list.',
    bucket: 'm',
    platforms: ['docs'],
    keywords: ['docs', 'search', 'ai', 'operator', 'help', 'natural language'],
  },
  {
    id: 'sponsor-roi-roll-up',
    emoji: '💰',
    title: 'Sponsor ROI quarterly roll-up',
    description: 'Auto-aggregate ad impressions, broadcast minutes, and on-site activations into a sponsor-ready ROI brief.',
    bucket: 'l',
    platforms: ['crm'],
    keywords: ['sponsor', 'roi', 'impressions', 'broadcast', 'quarterly', 'brief'],
  },
]

// Pattern → clarifying questions. Fires when the user's description matches.
// 2-4 questions show up before the final scope generation so the AI has
// enough info to quote and plan accurately.
export interface ClarifyPattern {
  id: string
  triggers: string[] // keyword triggers
  questions: string[]
}

export const CLARIFY_PATTERNS: ClarifyPattern[] = [
  {
    id: 'report',
    triggers: ['report', 'dashboard', 'widget', 'metric', 'kpi'],
    questions: [
      'Who needs to see it — one stakeholder or a team page?',
      'How fresh — live, daily refresh, or weekly?',
      'Should it export to PDF / email automatically?',
    ],
  },
  {
    id: 'automation',
    triggers: ['automate', 'automation', 'auto', 'trigger', 'when X then Y'],
    questions: [
      'What triggers it — a database change, a schedule, or a manual button?',
      'Where does the output land — Slack, email, a CRM record, a webhook?',
      'Should it run for all rows or only a filtered subset?',
    ],
  },
  {
    id: 'integration',
    triggers: ['sync', 'integration', 'pull', 'import', 'connect', 'api'],
    questions: [
      'Which system are we connecting to — name and API access?',
      'One-way or two-way sync?',
      'Real-time, scheduled, or on-demand?',
    ],
  },
  {
    id: 'venue',
    triggers: ['venue', 'arena', 'stadium', 'site'],
    questions: [
      'All venues, a region, or a specific venue list?',
      'Per-event, per-season, or always-on?',
    ],
  },
  {
    id: 'design',
    triggers: ['design', 'designer', 'creative', 'graphic'],
    questions: [
      'Inside the Service Dashboard (Alexis\'s flow) or the CRM (Daniel/Leda)?',
      'Should it tie to Hours Budgets for tracking?',
    ],
  },
  {
    id: 'staff',
    triggers: ['staff', 'tech', 'technician', 'employee', 'crew'],
    questions: [
      'All staff or a specific role (techs / managers / contractors)?',
      'Should it gate by venue assignment or role permission?',
    ],
  },
  {
    id: 'mobile',
    triggers: ['mobile', 'phone', 'app', 'tablet', 'field'],
    questions: [
      'Should it work offline and sync later?',
      'Native app or mobile-optimized web?',
    ],
  },
  {
    id: 'notification',
    triggers: ['slack', 'email', 'alert', 'notification', 'ping'],
    questions: [
      'Per-venue channel or a central channel?',
      '@-mention specific people or post quietly?',
    ],
  },
]

export function detectClarifyQuestions(description: string): string[] {
  const lower = description.toLowerCase()
  const seen = new Set<string>()
  const questions: string[] = []
  for (const pattern of CLARIFY_PATTERNS) {
    const hit = pattern.triggers.some(t => lower.includes(t))
    if (!hit) continue
    for (const q of pattern.questions) {
      if (!seen.has(q)) {
        seen.add(q)
        questions.push(q)
      }
    }
  }
  return questions.slice(0, 4)
}

export function rateForHours(hours: number): number {
  let rate = BASE_RATE
  for (const band of HOUR_BANDS) {
    if (hours >= band.minHours) rate = band.rate
  }
  return rate
}

export function bandForHours(hours: number): HourBand {
  let active = HOUR_BANDS[0]
  for (const band of HOUR_BANDS) {
    if (hours >= band.minHours) active = band
  }
  return active
}

export function fmtUSD(n: number): string {
  if (n === 0) return '$0'
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return '$' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'K'
  }
  return '$' + n.toLocaleString()
}
