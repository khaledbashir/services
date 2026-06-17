import type { NewsletterThemeId } from './types'

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

/** Media & Partnerships newsletter palette + DealDeck layout discipline */
export const ANC_NEWSLETTER_THEME: NewsletterThemeTokens = {
  id: 'ancNewsletter',
  name: 'ANC Newsletter',
  fonts: {
    heading: "Verdana, Geneva, 'Segoe UI', sans-serif",
    body: "Lato, Verdana, Geneva, 'Segoe UI', sans-serif",
  },
  colors: {
    navy: '#212240',
    primary: '#0047BB',
    accent: '#7350FF',
    background: '#F4F7FB',
    surface: '#FFFFFF',
    text: '#172033',
    muted: '#64748B',
    border: '#E2E8F0',
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
