import { getNewsletterTheme } from './theme'
import type { NewsletterSection, NewsletterVisualDocument } from './types'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function paragraphHtml(body: string, color: string, font: string, size = '15px'): string {
  return body
    .split('\n')
    .filter(Boolean)
    .map(
      (line) =>
        `<p style="margin:0 0 14px;font-family:${font};font-size:${size};line-height:1.65;color:${color}">${esc(line)}</p>`,
    )
    .join('')
}

function buttonHtml(label: string, url: string, bg: string, text: string): string {
  if (!label.trim()) return ''
  const href = url.trim() || '#'
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px 0 0"><tr><td style="border-radius:6px;background:${bg}"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-family:Verdana,Geneva,sans-serif;font-size:14px;font-weight:700;color:${text};text-decoration:none">${esc(label)}</a></td></tr></table>`
}

function renderSection(section: NewsletterSection, theme = getNewsletterTheme('ancNewsletter')): string {
  const { colors, fonts } = theme

  switch (section.type) {
    case 'hero': {
      const image =
        section.imageUrl?.trim() &&
        `<tr><td style="padding:0"><img src="${esc(section.imageUrl.trim())}" alt="${esc(section.imageAlt || '')}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0" /></td></tr>`
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-collapse:collapse;background:${colors.navy};border-radius:8px;overflow:hidden">
        ${image || ''}
        <tr><td style="padding:28px 24px 24px">
          ${section.eyebrow ? `<div style="font-family:${fonts.body};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${colors.accent};margin:0 0 10px">${esc(section.eyebrow)}</div>` : ''}
          ${section.headline ? `<h1 style="margin:0 0 12px;font-family:${fonts.heading};font-size:28px;line-height:1.15;font-weight:800;color:#FFFFFF">${esc(section.headline)}</h1>` : ''}
          ${section.body ? `<div style="font-family:${fonts.body};font-size:15px;line-height:1.65;color:#D9E2F2">${esc(section.body)}</div>` : ''}
        </td></tr>
      </table>`
    }
    case 'spotlight':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border-collapse:collapse">
        <tr><td style="border-left:4px solid ${colors.accent};background:${colors.surface};padding:16px 18px;border-radius:0 8px 8px 0">
          ${section.eyebrow ? `<div style="font-family:${fonts.body};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${colors.muted};margin:0 0 6px">${esc(section.eyebrow)}</div>` : ''}
          ${section.headline ? `<div style="font-family:${fonts.heading};font-size:20px;font-weight:800;line-height:1.25;color:${colors.text};margin:0 0 8px">${esc(section.headline)}</div>` : ''}
          ${section.body ? `<div style="font-family:${fonts.body};font-size:14px;line-height:1.65;color:${colors.muted}">${esc(section.body)}</div>` : ''}
        </td></tr>
      </table>`
    case 'story': {
      const textBlock = `<td valign="top" style="padding:0 0 0 16px;font-family:${fonts.body}">
          ${section.eyebrow ? `<div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${colors.muted};margin:0 0 6px">${esc(section.eyebrow)}</div>` : ''}
          ${section.headline ? `<h2 style="margin:0 0 10px;font-family:${fonts.heading};font-size:20px;line-height:1.25;color:${colors.text}">${esc(section.headline)}</h2>` : ''}
          ${section.body ? paragraphHtml(section.body, colors.muted, fonts.body, '14px') : ''}
        </td>`
      const imageBlock =
        section.imageUrl?.trim() &&
        `<td valign="top" width="220" style="padding:0"><img src="${esc(section.imageUrl.trim())}" alt="${esc(section.imageAlt || '')}" width="220" style="display:block;width:100%;max-width:220px;height:auto;border-radius:8px;border:0" /></td>`
      if (imageBlock && section.imagePosition === 'left') {
        return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px"><tr>${imageBlock}${textBlock}</tr></table>`
      }
      if (imageBlock) {
        return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px"><tr>${textBlock}${imageBlock}</tr></table>`
      }
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px"><tr>${textBlock}</tr></table>`
    }
    case 'event':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border:1px solid ${colors.border};border-radius:8px;background:${colors.surface}">
        <tr><td style="padding:18px 20px">
          ${section.eventDate ? `<div style="font-family:${fonts.body};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${colors.primary};margin:0 0 8px">${esc(section.eventDate)}</div>` : ''}
          ${section.headline ? `<h2 style="margin:0 0 6px;font-family:${fonts.heading};font-size:20px;line-height:1.25;color:${colors.text}">${esc(section.headline)}</h2>` : ''}
          ${section.venue ? `<div style="font-family:${fonts.body};font-size:13px;font-weight:600;color:${colors.muted};margin:0 0 10px">${esc(section.venue)}</div>` : ''}
          ${section.body ? paragraphHtml(section.body, colors.muted, fonts.body, '14px') : ''}
          ${buttonHtml(section.ctaLabel || '', section.ctaUrl || '', colors.primary, colors.buttonText)}
        </td></tr>
      </table>`
    case 'cta':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-collapse:collapse;background:linear-gradient(135deg, ${colors.primary} 0%, ${colors.accent} 100%);border-radius:8px">
        <tr><td style="padding:24px 22px;text-align:center">
          ${section.headline ? `<h2 style="margin:0 0 10px;font-family:${fonts.heading};font-size:22px;line-height:1.25;color:#FFFFFF">${esc(section.headline)}</h2>` : ''}
          ${section.body ? `<div style="font-family:${fonts.body};font-size:14px;line-height:1.6;color:#E8EEF7;margin:0 0 4px">${esc(section.body)}</div>` : ''}
          ${buttonHtml(section.ctaLabel || 'Learn more', section.ctaUrl || '', '#FFFFFF', colors.primary)}
        </td></tr>
      </table>`
    case 'divider':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px"><tr><td style="border-top:1px solid ${colors.border};font-size:0;line-height:0">&nbsp;</td></tr></table>`
    default:
      return ''
  }
}

export function exportNewsletterBodyHtml(doc: NewsletterVisualDocument): string {
  const theme = getNewsletterTheme(doc.theme)
  const sections = doc.sections.map((section) => renderSection(section, theme)).join('\n')
  return sections.trim()
}

export function exportNewsletterFullHtml(
  doc: NewsletterVisualDocument,
  options?: { unsubscribeUrl?: string; preview?: boolean },
): string {
  const theme = getNewsletterTheme(doc.theme)
  const body = exportNewsletterBodyHtml(doc)
  const unsubscribe = options?.unsubscribeUrl
    ? `<a href="${esc(options.unsubscribeUrl)}" style="color:${theme.colors.muted};text-decoration:underline">Unsubscribe</a>`
    : `<span style="color:${theme.colors.muted}">Unsubscribe link generated at send time</span>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(doc.subject || 'ANC Newsletter')}</title>
</head>
<body style="margin:0;padding:0;background:${theme.colors.background};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${theme.colors.background};padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;border-collapse:collapse">
          <tr>
            <td style="padding:0 0 18px;border-bottom:3px solid ${theme.colors.primary}">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-family:${theme.fonts.heading};font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${theme.colors.navy}">ANC Sports</td>
                  <td align="right" style="font-family:${theme.fonts.body};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${theme.colors.accent}">Media &amp; Partnerships</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="padding:24px 0 0">${body}</td></tr>
          <tr>
            <td style="padding:24px 0 0;border-top:1px solid ${theme.colors.border};font-family:${theme.fonts.body};font-size:12px;line-height:1.6;color:${theme.colors.muted};text-align:center">
              ANC Sports · Venue media, partnerships, and sponsor-ready inventory<br />
              ${unsubscribe}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}
