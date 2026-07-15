export type AdTemplateId = 'spotlight' | 'cinematic' | 'statement'

export type AdCopyInput = {
  eyebrow?: string
  headline: string
  cta?: string
  tagline?: string
}

export type TemplateInput = {
  template: AdTemplateId
  width: number
  height: number
  copy: AdCopyInput
  photoDataUri: string
  logoDataUri: string
  /** Vertical focus of the photo, 0 (top) to 100 (bottom). */
  photoFocusY?: number
}

export const AD_TEMPLATES: Array<{ id: AdTemplateId; label: string; description: string }> = [
  {
    id: 'spotlight',
    label: 'Spotlight',
    description: 'Logo, headline, and CTA over a side scrim — the flagship banner look.',
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    description: 'Photo-led with the ANC mark only — best for native placements where copy lives outside the image.',
  },
  {
    id: 'statement',
    label: 'Statement',
    description: 'Centered headline over a full dark scrim — bold, typographic.',
  },
]

const FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Mono:wght@500&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Renders `**accent**` markers inside a headline as brand-blue spans. */
function headlineHtml(headline: string): string {
  return esc(headline).replace(/\*\*(.+?)\*\*/g, '<span style="color:#4F86FF">$1</span>')
}

function clampPx(value: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, value)))
}

function shell(width: number, height: number, inner: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${FONTS}<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${width}px;height:${height}px;overflow:hidden}
@keyframes ctaPulse{0%,100%{box-shadow:0 0 0 0 rgba(79,134,255,0)}50%{box-shadow:0 0 0 6px rgba(79,134,255,.28)}}
[data-frame="1"] .cta{box-shadow:0 0 0 3px rgba(79,134,255,.18)}
[data-frame="2"] .cta{box-shadow:0 0 0 6px rgba(79,134,255,.30)}
[data-frame="3"] .cta{box-shadow:0 0 0 3px rgba(79,134,255,.18)}
</style></head><body>${inner}</body></html>`
}

function spotlightTemplate(input: TemplateInput): string {
  const { width, height, copy } = input
  const compact = height < 140
  const logoH = clampPx(height * 0.1, 12, 26)
  const headlineSize = clampPx(Math.min(height * 0.108, width * 0.045), 13, 34)
  const eyebrowSize = clampPx(height * 0.038, 8, 10)
  const ctaSize = clampPx(height * 0.044, 9, 11)
  const pad = clampPx(width * 0.046, 12, 34)
  const textWidth = compact ? width * 0.72 : Math.min(width * 0.58, 400)
  const focusY = input.photoFocusY ?? 35

  const inner = `
  <div style="position:relative;width:${width}px;height:${height}px;background:#0A0F1C url('${input.photoDataUri}') no-repeat;background-size:cover;background-position:center ${focusY}%;font-family:'Inter',sans-serif">
    <div style="position:absolute;inset:0;background:linear-gradient(90deg,rgba(7,12,24,.96) 0%,rgba(7,12,24,.93) 30%,rgba(7,12,24,.72) 46%,rgba(7,12,24,.18) 68%,rgba(7,12,24,0) 82%)"></div>
    <div style="position:absolute;left:0;top:0;bottom:0;width:3px;background:linear-gradient(180deg,#00AEEF,#0A52EF)"></div>
    <div style="position:absolute;left:${pad}px;top:0;bottom:0;width:${Math.round(textWidth)}px;display:flex;flex-direction:column;justify-content:center">
      <img src="${input.logoDataUri}" alt="ANC" style="height:${logoH}px;width:auto;align-self:flex-start;margin-bottom:${compact ? 6 : clampPx(height * 0.064, 8, 16)}px">
      ${
        !compact && copy.eyebrow
          ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:${eyebrowSize}px;letter-spacing:.28em;color:#00AEEF;text-transform:uppercase;margin-bottom:${clampPx(height * 0.036, 5, 9)}px">${esc(copy.eyebrow)}</div>`
          : ''
      }
      <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:${headlineSize}px;line-height:1.14;letter-spacing:-.015em;color:#F2F6FF;margin-bottom:${compact ? 8 : clampPx(height * 0.072, 10, 18)}px">${headlineHtml(copy.headline)}</div>
      ${
        copy.cta
          ? `<div class="cta" style="display:inline-flex;align-items:center;gap:8px;align-self:flex-start;background:#0A52EF;color:#fff;border-radius:999px;padding:${clampPx(height * 0.036, 5, 9)}px ${clampPx(height * 0.072, 10, 18)}px;font-family:'IBM Plex Mono',monospace;font-size:${ctaSize}px;font-weight:500;letter-spacing:.08em;text-transform:uppercase">${esc(copy.cta)} <span style="font-family:'Inter',sans-serif;font-weight:600">&rarr;</span></div>`
          : ''
      }
    </div>
  </div>`
  return shell(width, height, inner)
}

function cinematicTemplate(input: TemplateInput): string {
  const { width, height, copy } = input
  const logoH = clampPx(height * 0.083, 14, 28)
  const pad = clampPx(width * 0.043, 12, 28)
  const tagSize = clampPx(height * 0.032, 8, 10)
  const focusY = input.photoFocusY ?? 60

  const inner = `
  <div style="position:relative;width:${width}px;height:${height}px;background:#0A0F1C url('${input.photoDataUri}') no-repeat;background-size:cover;background-position:center ${focusY}%;font-family:'Inter',sans-serif">
    <div style="position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,12,24,.28) 0%,rgba(7,12,24,0) 34%,rgba(7,12,24,.12) 62%,rgba(7,12,24,.9) 100%)"></div>
    <div style="position:absolute;left:${pad}px;right:${pad}px;bottom:${clampPx(height * 0.064, 12, 22)}px;display:flex;align-items:flex-end;justify-content:space-between">
      <img src="${input.logoDataUri}" alt="ANC" style="height:${logoH}px;width:auto;display:block">
      ${
        copy.tagline
          ? `<div style="font-family:'IBM Plex Mono',monospace;font-size:${tagSize}px;letter-spacing:.26em;color:#DCE7FA;text-transform:uppercase;text-shadow:0 1px 8px rgba(0,0,0,.6)">${esc(copy.tagline)} <span style="color:#00AEEF">&#9679;</span> ANC.COM</div>`
          : ''
      }
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#0A52EF,#00AEEF)"></div>
  </div>`
  return shell(width, height, inner)
}

function statementTemplate(input: TemplateInput): string {
  const { width, height, copy } = input
  const logoH = clampPx(height * 0.09, 14, 26)
  const headlineSize = clampPx(Math.min(height * 0.13, width * 0.052), 15, 40)
  const ctaSize = clampPx(height * 0.044, 9, 11)
  const focusY = input.photoFocusY ?? 45

  const inner = `
  <div style="position:relative;width:${width}px;height:${height}px;background:#0A0F1C url('${input.photoDataUri}') no-repeat;background-size:cover;background-position:center ${focusY}%;font-family:'Inter',sans-serif">
    <div style="position:absolute;inset:0;background:rgba(7,12,24,.78)"></div>
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 ${clampPx(width * 0.08, 16, 60)}px">
      <img src="${input.logoDataUri}" alt="ANC" style="height:${logoH}px;width:auto;margin-bottom:${clampPx(height * 0.06, 8, 18)}px">
      <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:${headlineSize}px;line-height:1.14;letter-spacing:-.015em;color:#F2F6FF;max-width:${Math.round(width * 0.86)}px">${headlineHtml(copy.headline)}</div>
      ${
        copy.cta
          ? `<div class="cta" style="display:inline-flex;align-items:center;gap:8px;margin-top:${clampPx(height * 0.07, 10, 20)}px;background:#0A52EF;color:#fff;border-radius:999px;padding:${clampPx(height * 0.036, 5, 9)}px ${clampPx(height * 0.072, 10, 18)}px;font-family:'IBM Plex Mono',monospace;font-size:${ctaSize}px;font-weight:500;letter-spacing:.08em;text-transform:uppercase">${esc(copy.cta)} <span style="font-family:'Inter',sans-serif;font-weight:600">&rarr;</span></div>`
          : ''
      }
    </div>
  </div>`
  return shell(width, height, inner)
}

export function buildAdHtml(input: TemplateInput): string {
  switch (input.template) {
    case 'cinematic':
      return cinematicTemplate(input)
    case 'statement':
      return statementTemplate(input)
    case 'spotlight':
    default:
      return spotlightTemplate(input)
  }
}
