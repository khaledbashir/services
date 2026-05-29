/**
 * Shared ANC branded email shell — light theme matching the CRM scheduled-report look.
 * Wrap any inner HTML so all outbound mail carries one consistent, professional frame
 * (white card, bold title, muted subtitle, footer). Use with sendEmail() from lib/email.
 */
const BORDER = '1px solid #e5e7eb'

export function brandedEmail(opts: {
  title: string
  subtitle?: string
  bodyHtml: string
  footerNote?: string
}): string {
  const subtitle = opts.subtitle
    ? `<div style="color:#6b7280;font-size:13px;margin-top:10px">${opts.subtitle}</div>`
    : ''
  const footer = opts.footerNote || 'ANC Sports · automated notification'
  return `<div style="margin:0;padding:0;background:#f3f4f6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="680" cellpadding="0" cellspacing="0" style="max-width:680px;width:100%;background:#ffffff;border:${BORDER};border-radius:10px;font-family:-apple-system,Segoe UI,Arial,sans-serif">
<tr><td style="padding:30px 34px 6px">
<div style="font-size:24px;font-weight:800;color:#111827;line-height:1.25">${opts.title}</div>
${subtitle}
</td></tr>
<tr><td style="padding:18px 34px 6px;font-size:14px;color:#111827;line-height:1.55">${opts.bodyHtml}</td></tr>
<tr><td style="padding:14px 34px 30px"><div style="color:#9ca3af;font-size:12px;border-top:${BORDER};padding-top:14px">${footer}</div></td></tr>
</table></td></tr></table></div>`
}

/**
 * Render a simple branded data table (light header row, thin borders, optional right-aligned
 * numeric columns, optional bold total row) — matches the scheduled-report table style.
 */
export function brandedTable(opts: {
  headers: string[]
  rows: string[][]
  rightAlignFrom?: number // column index from which cells right-align (e.g. 1)
  totalRow?: string[]
}): string {
  const ra = opts.rightAlignFrom ?? 1
  const align = (i: number) => (i >= ra ? 'right' : 'left')
  const th = opts.headers
    .map((h, i) => `<th style="padding:11px 14px;border-bottom:2px solid #d1d5db;text-align:${align(i)};font-size:13px;color:#111827;background:#f9fafb">${h}</th>`)
    .join('')
  const body = opts.rows
    .map(
      (r) =>
        `<tr>${r.map((c, i) => `<td style="padding:11px 14px;border-bottom:${BORDER};text-align:${align(i)}">${c}</td>`).join('')}</tr>`,
    )
    .join('')
  const total = opts.totalRow
    ? `<tr style="background:#f9fafb">${opts.totalRow.map((c, i) => `<td style="padding:11px 14px;border-bottom:${BORDER};text-align:${align(i)};font-weight:700">${c}</td>`).join('')}</tr>`
    : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:${BORDER};border-radius:6px;overflow:hidden;font-size:14px;color:#111827">
<tr>${th}</tr>${body}${total}</table>`
}
