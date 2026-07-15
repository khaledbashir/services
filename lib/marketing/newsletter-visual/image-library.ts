/**
 * Curated real ANC installation photography for newsletter imagery.
 * Brand rule: newsletters only ever use authentic ANC-owned imagery — never
 * stock, never AI-invented venues. The composer offers this list to the model
 * and validates every returned URL against it, so a hallucinated image URL can
 * never reach a send.
 */

export type NewsletterImage = {
  /** absolute URL — email clients need fully-qualified sources */
  url: string
  /** what the photo actually shows — the model picks by this */
  description: string
  alt: string
}

const BASE = process.env.PUBLIC_APP_URL || 'https://services.ancsports.net'

function img(path: string, description: string, alt: string): NewsletterImage {
  return { url: `${BASE}${path}`, description, alt }
}

export const NEWSLETTER_IMAGE_LIBRARY: NewsletterImage[] = [
  // Stadium / game day
  img('/ad-library/levis-touchdown.jpg', "Levi's Stadium (49ers) — touchdown moment on the main videoboard, packed stands, daytime", "Levi's Stadium videoboard on game day"),
  img('/ad-library/levis-night.jpg', "Levi's Stadium (49ers) — night game, boards glowing over the crowd", "Levi's Stadium at night"),
  img('/ad-library/redsox-fenway.jpg', 'Fenway Park (Red Sox) — game day with ANC-run displays', 'Fenway Park on game day'),
  img('/dealdeck/anc-real/nationals-park-scoreboard.jpg', 'Nationals Park — main scoreboard over the outfield', 'Nationals Park scoreboard'),
  img('/dealdeck/anc-real/polar-park-stadium.jpg', 'Polar Park — ballpark videoboard and seating bowl', 'Polar Park videoboard'),
  img('/dealdeck/anc-real/commanders-stadium-led.jpg', 'Commanders stadium — LED ribbon and displays through the bowl', 'Commanders stadium LED displays'),
  img('/dealdeck/anc-real/dkr-stadium-led.jpg', 'DKR Texas Memorial Stadium — massive endzone LED', 'DKR Texas Memorial Stadium LED'),
  img('/dealdeck/anc-real/south-carolina-stadium.jpg', 'Williams-Brice Stadium (South Carolina) — stadium LED system', 'Williams-Brice Stadium display'),
  img('/dealdeck/anc-real/oregon-stadium-led.jpg', 'Oregon stadium — LED videoboard', 'Oregon stadium videoboard'),
  img('/dealdeck/anc-real/berkeley-stadium-led.jpg', 'Cal Memorial Stadium (Berkeley) — scoreboard install', 'Cal Memorial Stadium scoreboard'),
  img('/dealdeck/anc-real/american-airlines-sideline.jpg', 'American Airlines Center — sideline LED courtside', 'American Airlines Center sideline LED'),
  // Arena / indoor
  img('/dealdeck/anc-real/76ers-arena-centerhung.jpg', 'Wells Fargo Center (76ers) — center-hung videoboard over the court', 'Wells Fargo Center center-hung board'),
  img('/ad-library/pacers-bowl.jpg', 'Gainbridge Fieldhouse (Pacers) — arena bowl with displays', 'Gainbridge Fieldhouse arena bowl'),
  img('/ad-library/kia-center.jpg', 'Kia Center (Orlando) — arena technology overhaul', 'Kia Center displays'),
  img('/dealdeck/anc-real/cavs-tunnel-led.jpg', 'Rocket Arena (Cavs) — LED tunnel entrance', 'Rocket Arena LED tunnel'),
  img('/dealdeck/anc-real/cavs-penthouse.jpg', 'Rocket Arena (Cavs) — premium penthouse space with displays', 'Rocket Arena premium space'),
  img('/dealdeck/anc-real/wfc-concourse-atrium.jpg', 'Wells Fargo Center — concourse atrium displays', 'Wells Fargo Center concourse'),
  img('/dealdeck/anc-real/wells-center-concourse.jpg', 'Wells Fargo Center — concourse display line', 'Arena concourse displays'),
  // Premium / hospitality / commercial
  img('/ad-library/mtbank-club.jpg', 'M&T Bank Stadium (Ravens) — club level hospitality displays', 'M&T Bank Stadium club level'),
  img('/dealdeck/anc-real/aventura-mall-display.jpg', 'Aventura Mall — large-format retail display', 'Aventura Mall display'),
  img('/dealdeck/anc-real/pier17-led.jpg', 'Pier 17 NYC — outdoor entertainment LED', 'Pier 17 LED screen'),
  img('/dealdeck/anc-real/nbcu-rotunda.jpg', 'NBCUniversal rotunda — architectural media wall', 'NBCUniversal media rotunda'),
  img('/dealdeck/anc-real/fulton-center-led.jpg', 'Fulton Center transit hub — LED media architecture', 'Fulton Center LED'),
  img('/dealdeck/anc-real/royal-caribbean-terminal.jpg', 'Royal Caribbean terminal — arrival experience displays', 'Royal Caribbean terminal displays'),
  img('/dealdeck/anc-real/omni-pga-frisco.jpg', 'Omni PGA Frisco — hospitality display environment', 'Omni PGA Frisco displays'),
  img('/dealdeck/anc-real/notre-dame-installation.jpg', 'Notre Dame — display installation in progress, technicians at work', 'Notre Dame installation work'),
  // Operations / production
  img('/dealdeck/anc-real/control-room.jpg', 'ANC control room — operators running venue content', 'ANC control room'),
  img('/ad-library/big10-football.jpg', 'ANC Studios — Big Ten football production', 'Big Ten production at ANC Studios'),
]

/** LLM-facing menu: numbered so the model can reference stable URLs verbatim. */
export function imageLibraryPromptBlock(): string {
  return NEWSLETTER_IMAGE_LIBRARY
    .map((p) => `- ${p.url} — ${p.description}`)
    .join('\n')
}

const VALID_URLS = new Set(NEWSLETTER_IMAGE_LIBRARY.map((p) => p.url))

/** Only library URLs survive — anything else (hallucinated, external) is dropped. */
export function sanitizeImageUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  const trimmed = url.trim()
  return VALID_URLS.has(trimmed) ? trimmed : undefined
}

export function altForUrl(url: string | undefined): string {
  if (!url) return ''
  return NEWSLETTER_IMAGE_LIBRARY.find((p) => p.url === url)?.alt || 'ANC installation'
}
