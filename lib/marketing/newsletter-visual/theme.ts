import type { NewsletterThemeId, NewsletterStyle, NewsletterVisualDocument } from './types'

export type NewsletterThemeTokens = {
  id: NewsletterThemeId
  name: string
  fonts: { heading: string; body: string }
  colors: {
    navy: string
    primary: string
    accent: string
    background: string
    surface: string
    text: string
    muted: string
    border: string
    buttonText: string
  }
}

/** Media & Partnerships newsletter palette + DealDeck layout discipline. */
export const ANC_NEWSLETTER_THEME: NewsletterThemeTokens = {
  id: 'ancNewsletter',
  name: 'ANC Newsletter',
  fonts: {
    heading: "Verdana, Geneva, 'Segoe UI', sans-serif",
    body: "Lato, Verdana, Geneva, 'Segoe UI', sans-serif",
  },
  colors: {
    navy: '#07111F',
    primary: '#0A52EF',
    accent: '#00A3FF',
    background: '#F3F6FA',
    surface: '#FFFFFF',
    text: '#101828',
    muted: '#5F6B7A',
    border: '#D8E0EA',
    buttonText: '#FFFFFF',
  },
}

/** DealDeck sponsor/media theme — gold accent variant */
export const ANC_SPONSOR_MEDIA_THEME: NewsletterThemeTokens = {
  id: 'ancSponsorMedia',
  name: 'ANC Sponsor Media',
  fonts: {
    heading: "Inter, Verdana, Geneva, 'Segoe UI', sans-serif",
    body: "Inter, Lato, Verdana, Geneva, 'Segoe UI', sans-serif",
  },
  colors: {
    navy: '#07111F',
    primary: '#0047BB',
    accent: '#C8A24A',
    background: '#FBFCFE',
    surface: '#FFFFFF',
    text: '#202636',
    muted: '#64748B',
    border: '#E2E8F0',
    buttonText: '#FFFFFF',
  },
}

export function getNewsletterTheme(themeId: NewsletterThemeId): NewsletterThemeTokens {
  return themeId === 'ancSponsorMedia' ? ANC_SPONSOR_MEDIA_THEME : ANC_NEWSLETTER_THEME
}

/** Fully-resolved, no-undefined style for rendering. Every field has a value. */
export type ResolvedNewsletterStyle = {
  backgroundColor: string
  contentBackground: string
  accentColor: string
  textColor: string
  mutedColor: string
  linkColor: string
  borderColor: string
  navy: string
  primary: string
  buttonText: string
  headingFont: string
  bodyFont: string
  contentWidth: number
  padding: number
}

/** Sensible defaults derived from the theme tokens (so docs with no `style` are unchanged). */
const DEFAULT_CONTENT_WIDTH = 600
const DEFAULT_PADDING = 24

function clampNum(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Merge a document's optional Global-style overrides over its theme tokens.
 * Returns a fully-resolved style object both the live preview and the exported
 * email HTML consume, so the two never drift.
 */
export function resolveNewsletterStyle(doc: Pick<NewsletterVisualDocument, 'theme' | 'style'>): ResolvedNewsletterStyle {
  const theme = getNewsletterTheme(doc.theme)
  const s: NewsletterStyle = doc.style || {}
  return {
    backgroundColor: s.backgroundColor || theme.colors.background,
    contentBackground: s.contentBackground || theme.colors.surface,
    accentColor: s.accentColor || theme.colors.accent,
    textColor: s.textColor || theme.colors.text,
    mutedColor: theme.colors.muted,
    linkColor: s.linkColor || theme.colors.primary,
    borderColor: theme.colors.border,
    navy: theme.colors.navy,
    primary: theme.colors.primary,
    buttonText: theme.colors.buttonText,
    headingFont: s.headingFont || theme.fonts.heading,
    bodyFont: s.bodyFont || theme.fonts.body,
    contentWidth: clampNum(s.contentWidth, 480, 720, DEFAULT_CONTENT_WIDTH),
    padding: clampNum(s.padding, 0, 48, DEFAULT_PADDING),
  }
}
