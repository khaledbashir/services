export type AdFormat = {
  id: string
  label: string
  group: string
  width: number
  height: number
  maxBytes: number
  note?: string
}

export const AD_FORMATS: AdFormat[] = [
  {
    id: 'sbj-ad-unit',
    label: 'SBJ Newsletter Ad Unit',
    group: 'Sports Business Journal',
    width: 650,
    height: 250,
    maxBytes: 250 * 1024,
    note: 'Part 1 — newsletter ad unit, PNG/JPG, click-thru URL',
  },
  {
    id: 'sbj-header',
    label: 'SBJ Headline Placement Header',
    group: 'Sports Business Journal',
    width: 600,
    height: 314,
    maxBytes: 250 * 1024,
    note: 'Part 2 — header image above sponsor copy blocks',
  },
  {
    id: 'social-landscape',
    label: 'Social / Link Preview',
    group: 'Standard',
    width: 1200,
    height: 628,
    maxBytes: 1024 * 1024,
  },
  {
    id: 'iab-medium-rectangle',
    label: 'Medium Rectangle',
    group: 'Standard',
    width: 300,
    height: 250,
    maxBytes: 200 * 1024,
  },
  {
    id: 'iab-leaderboard',
    label: 'Leaderboard',
    group: 'Standard',
    width: 728,
    height: 90,
    maxBytes: 200 * 1024,
  },
  {
    id: 'iab-half-page',
    label: 'Half Page',
    group: 'Standard',
    width: 300,
    height: 600,
    maxBytes: 250 * 1024,
  },
]

export const CUSTOM_FORMAT_LIMITS = {
  minSize: 50,
  maxSize: 2400,
  defaultMaxBytes: 250 * 1024,
}

export function resolveFormat(input: {
  formatId?: string
  width?: number
  height?: number
  maxBytes?: number
}): { width: number; height: number; maxBytes: number; formatId: string } | null {
  if (input.formatId && input.formatId !== 'custom') {
    const preset = AD_FORMATS.find(f => f.id === input.formatId)
    if (!preset) return null
    return { width: preset.width, height: preset.height, maxBytes: preset.maxBytes, formatId: preset.id }
  }
  const width = Math.round(Number(input.width))
  const height = Math.round(Number(input.height))
  const { minSize, maxSize, defaultMaxBytes } = CUSTOM_FORMAT_LIMITS
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  if (width < minSize || width > maxSize || height < minSize || height > maxSize) return null
  const maxBytes = Number(input.maxBytes) > 0 ? Math.min(Number(input.maxBytes), 5 * 1024 * 1024) : defaultMaxBytes
  return { width, height, maxBytes, formatId: 'custom' }
}
