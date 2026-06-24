import { resolveNewsletterStyle, type ResolvedNewsletterStyle } from './theme'
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

function buttonHtml(label: string, url: string, bg: string, text: string, font: string): string {
  if (!label.trim()) return ''
  const href = url.trim() || '#'
  return `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:18px 0 0"><tr><td style="border-radius:6px;background:${bg}"><a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-family:${font};font-size:14px;font-weight:700;color:${text};text-decoration:none">${esc(label)}</a></td></tr></table>`
}

function renderSection(section: NewsletterSection, style: ResolvedNewsletterStyle): string {
  const { headingFont, bodyFont } = style

  switch (section.type) {
    case 'hero': {
      const image =
        section.imageUrl?.trim() &&
        `<tr><td style="padding:0"><img src="${esc(section.imageUrl.trim())}" alt="${esc(section.imageAlt || '')}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0" /></td></tr>`
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-collapse:collapse;background:${style.navy};border-radius:8px;overflow:hidden">
        ${image || ''}
        <tr><td style="padding:28px 24px 24px">
          ${section.eyebrow ? `<div style="font-family:${bodyFont};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:${style.accentColor};margin:0 0 10px">${esc(section.eyebrow)}</div>` : ''}
          ${section.headline ? `<h1 style="margin:0 0 12px;font-family:${headingFont};font-size:28px;line-height:1.15;font-weight:800;color:#FFFFFF">${esc(section.headline)}</h1>` : ''}
          ${section.body ? `<div style="font-family:${bodyFont};font-size:15px;line-height:1.65;color:#D9E2F2">${esc(section.body)}</div>` : ''}
        </td></tr>
      </table>`
    }
    case 'spotlight':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border-collapse:collapse">
        <tr><td style="border-left:4px solid ${style.accentColor};background:${style.contentBackground};padding:16px 18px;border-radius:0 8px 8px 0">
          ${section.eyebrow ? `<div style="font-family:${bodyFont};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${style.mutedColor};margin:0 0 6px">${esc(section.eyebrow)}</div>` : ''}
          ${section.headline ? `<div style="font-family:${headingFont};font-size:20px;font-weight:800;line-height:1.25;color:${style.textColor};margin:0 0 8px">${esc(section.headline)}</div>` : ''}
          ${section.body ? `<div style="font-family:${bodyFont};font-size:14px;line-height:1.65;color:${style.mutedColor}">${esc(section.body)}</div>` : ''}
        </td></tr>
      </table>`
    case 'story': {
      const textBlock = `<td valign="top" style="padding:0 0 0 16px;font-family:${bodyFont}">
          ${section.eyebrow ? `<div style="font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${style.mutedColor};margin:0 0 6px">${esc(section.eyebrow)}</div>` : ''}
          ${section.headline ? `<h2 style="margin:0 0 10px;font-family:${headingFont};font-size:20px;line-height:1.25;color:${style.textColor}">${esc(section.headline)}</h2>` : ''}
          ${section.body ? paragraphHtml(section.body, style.mutedColor, bodyFont, '14px') : ''}
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
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px;border:1px solid ${style.borderColor};border-radius:8px;background:${style.contentBackground}">
        <tr><td style="padding:18px 20px">
          ${section.eventDate ? `<div style="font-family:${bodyFont};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${style.primary};margin:0 0 8px">${esc(section.eventDate)}</div>` : ''}
          ${section.headline ? `<h2 style="margin:0 0 6px;font-family:${headingFont};font-size:20px;line-height:1.25;color:${style.textColor}">${esc(section.headline)}</h2>` : ''}
          ${section.venue ? `<div style="font-family:${bodyFont};font-size:13px;font-weight:600;color:${style.mutedColor};margin:0 0 10px">${esc(section.venue)}</div>` : ''}
          ${section.body ? paragraphHtml(section.body, style.mutedColor, bodyFont, '14px') : ''}
          ${buttonHtml(section.ctaLabel || '', section.ctaUrl || '', style.accentColor, style.buttonText, bodyFont)}
        </td></tr>
      </table>`
    case 'cta':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 24px;border-collapse:collapse;background:linear-gradient(135deg, ${style.primary} 0%, ${style.accentColor} 100%);border-radius:8px">
        <tr><td style="padding:24px 22px;text-align:center">
          ${section.headline ? `<h2 style="margin:0 0 10px;font-family:${headingFont};font-size:22px;line-height:1.25;color:#FFFFFF">${esc(section.headline)}</h2>` : ''}
          ${section.body ? `<div style="font-family:${bodyFont};font-size:14px;line-height:1.6;color:#E8EEF7;margin:0 0 4px">${esc(section.body)}</div>` : ''}
          ${buttonHtml(section.ctaLabel || 'Learn more', section.ctaUrl || '', '#FFFFFF', style.primary, bodyFont)}
        </td></tr>
      </table>`
    case 'divider':
      return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 20px"><tr><td style="border-top:1px solid ${style.borderColor};font-size:0;line-height:0">&nbsp;</td></tr></table>`
    default:
      return ''
  }
}

export function exportNewsletterBodyHtml(doc: NewsletterVisualDocument): string {
  const style = resolveNewsletterStyle(doc)
  const sections = doc.sections.map((section) => renderSection(section, style)).join('\n')
  return sections.trim()
}

export function exportNewsletterFullHtml(
  doc: NewsletterVisualDocument,
  options?: { unsubscribeUrl?: string; preview?: boolean },
): string {
  const style = resolveNewsletterStyle(doc)
  const body = exportNewsletterBodyHtml(doc)
  const unsubscribe = options?.unsubscribeUrl
    ? `<a href="${esc(options.unsubscribeUrl)}" style="color:${style.mutedColor};text-decoration:underline">Unsubscribe</a>`
    : `<span style="color:${style.mutedColor}">Unsubscribe link generated at send time</span>`

  // Style links across the whole document so the Global "Link color" is honored
  // by clients that respect <style> (and falls back gracefully for those that don't).
  const linkStyle = `<style>a{color:${style.linkColor}}</style>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(doc.subject || 'ANC Newsletter')}</title>
  ${linkStyle}
</head>
<body style="margin:0;padding:0;background:${style.backgroundColor};">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${style.backgroundColor};padding:24px 12px">
    <tr>
      <td align="center">
        <table role="presentation" width="${style.contentWidth}" cellspacing="0" cellpadding="0" style="max-width:${style.contentWidth}px;width:100%;border-collapse:collapse;background:${style.contentBackground};border-radius:12px;padding:${style.padding}px">
          <tr>
            <td style="padding:0 0 18px;border-bottom:3px solid ${style.primary}">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="font-family:${style.headingFont};font-size:13px;font-weight:800;letter-spacing:2px;text-transform:uppercase;color:${style.navy}">ANC Sports</td>
                  <td align="right" style="font-family:${style.bodyFont};font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${style.accentColor}">Media &amp; Partnerships</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr><td style="padding:24px 0 0">${body}</td></tr>
          <tr>
            <td style="padding:24px 0 0;border-top:1px solid ${style.borderColor};font-family:${style.bodyFont};font-size:12px;line-height:1.6;color:${style.mutedColor};text-align:center">
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
