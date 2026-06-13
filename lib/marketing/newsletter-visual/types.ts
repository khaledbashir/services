export type NewsletterThemeId = 'ancNewsletter' | 'ancSponsorMedia'

export type NewsletterSectionType =
  | 'hero'
  | 'story'
  | 'spotlight'
  | 'event'
  | 'cta'
  | 'divider'

export type NewsletterSection = {
  id: string
  type: NewsletterSectionType
  eyebrow?: string
  headline?: string
  body?: string
  imageUrl?: string
  imageAlt?: string
  imagePosition?: 'left' | 'right' | 'full'
  ctaLabel?: string
  ctaUrl?: string
  venue?: string
  eventDate?: string
}

export type NewsletterVisualDocument = {
  version: 1
  theme: NewsletterThemeId
  subject?: string
  previewText?: string
  sections: NewsletterSection[]
}

export const SECTION_LABELS: Record<NewsletterSectionType, string> = {
  hero: 'Hero',
  story: 'Story',
  spotlight: 'Spotlight',
  event: 'Event',
  cta: 'Call to action',
  divider: 'Divider',
}

export const SECTION_DESCRIPTIONS: Record<NewsletterSectionType, string> = {
  hero: 'Full-width header with headline and optional hero image',
  story: 'Text + image block for partnership or venue updates',
  spotlight: 'Accent-bordered lead story card',
  event: 'Date, venue, and event details with optional link',
  cta: 'Primary button for the next action',
  divider: 'Visual break between sections',
}

export function createSection(type: NewsletterSectionType): NewsletterSection {
  const id = crypto.randomUUID()
  switch (type) {
    case 'hero':
      return {
        id,
        type,
        eyebrow: 'Media & Partnerships',
        headline: 'ANC Sports Update',
        body: 'Your monthly briefing on venue media, partnerships, and sponsor-ready moments.',
        imageUrl: '',
        imageAlt: 'ANC venue media',
        imagePosition: 'full',
      }
    case 'story':
      return {
        id,
        type,
        eyebrow: 'Partnership Signals',
        headline: 'The story worth sharing',
        body: 'Use this block for sponsor-facing opportunities, league momentum, or campaign launches.',
        imageUrl: '',
        imageAlt: '',
        imagePosition: 'right',
      }
    case 'spotlight':
      return {
        id,
        type,
        eyebrow: 'Lead Story',
        headline: 'The moment worth opening with',
        body: 'Lead with the most useful partnership or venue story first.',
      }
    case 'event':
      return {
        id,
        type,
        eventDate: 'Upcoming',
        headline: 'Featured event',
        venue: 'Venue name',
        body: 'Brief context on why this event matters for partners and media inventory.',
        ctaLabel: 'Learn more',
        ctaUrl: 'https://www.ancsports.net',
      }
    case 'cta':
      return {
        id,
        type,
        headline: 'Ready to connect?',
        body: 'Reach out to discuss media inventory, venue partnerships, or upcoming opportunities.',
        ctaLabel: 'Contact ANC',
        ctaUrl: 'mailto:partnerships@ancsports.net',
      }
    case 'divider':
      return { id, type }
  }
}

export function parseVisualDocument(raw: unknown): NewsletterVisualDocument | null {
  if (!raw || typeof raw !== 'object') return null
  const doc = raw as Partial<NewsletterVisualDocument>
  if (doc.version !== 1 || !Array.isArray(doc.sections)) return null
  return {
    version: 1,
    theme: doc.theme === 'ancSponsorMedia' ? 'ancSponsorMedia' : 'ancNewsletter',
    subject: doc.subject,
    previewText: doc.previewText,
    sections: doc.sections.filter((s) => s && typeof s.id === 'string' && typeof s.type === 'string'),
  }
}
