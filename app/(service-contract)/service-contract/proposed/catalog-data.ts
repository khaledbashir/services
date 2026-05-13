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

export function fmtUSD(n: number): string {
  if (n === 0) return '$0'
  if (Math.abs(n) >= 1000) {
    const k = n / 1000
    return '$' + (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)) + 'K'
  }
  return '$' + n.toLocaleString()
}
