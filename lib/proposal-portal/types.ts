export type PortalMode = 'PROPOSAL' | 'PROJECT' | 'OPS'

export type PortalRecipeId = 'natalia' | 'jireh' | 'joe' | 'custom'

export type PortalModuleId =
  | 'venue-hero'
  | 'before-after'
  | 'solution-story'
  | 'proof-gallery'
  | 'team'
  | 'stats'
  | 'pricing'
  | 'timeline'
  | 'case-study'

export type PortalAudience = 'design' | 'sales' | 'ops'

export type PortalModuleDef = {
  id: PortalModuleId
  label: string
  description: string
  audience: PortalAudience[]
  scroll: 'pin' | 'river'
  required?: boolean
  implemented: boolean
}

export type PortalClientData = {
  clientName: string
  subtitle: string
  league: string
  investment: string
  investmentLabel: string
  heroImage: string
  beforeImage: string
  afterImage: string
  visionCopy?: string
  programCopy?: string
}

export type PortalDocument = {
  id?: string
  title: string
  mode: PortalMode
  recipe: PortalRecipeId
  enabledModules: PortalModuleId[]
  data: PortalClientData
  isPublic?: boolean
}

export const DEFAULT_PORTAL_DATA: PortalClientData = {
  clientName: 'Meridian Arena',
  subtitle: 'Centerhung LED Transformation',
  league: 'Renovation · 2026',
  investment: '$14.2M',
  investmentLabel: 'Total venue technology program',
  heroImage: '/dealdeck/anc-real/76ers-arena-centerhung.jpg',
  beforeImage: '/dealdeck/anc-real/hyatt-glassroom-before.png',
  afterImage: '/dealdeck/anc-real/hyatt-glassroom-after.png',
  visionCopy:
    'Every fan sees the game. Every sponsor gets impact. Every moment in the building plays to the same canvas — designed, installed, and operated by ANC.',
  programCopy:
    'Structural, electrical, fiber, CMS, and game-night operations — one accountable partner from concept through opening night.',
}