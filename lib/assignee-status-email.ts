/**
 * Pure rendering + delivery-resolution for status-change notifications.
 *
 * Split out from `assignee-status-notifications.ts` so it can be imported by the
 * test runner: that module pulls in the db, Slack and mail clients through the
 * `@/` alias, which plain `node --test` cannot resolve. This file deliberately
 * has NO imports at all — the caller wraps `bodyHtml` in `brandedEmail` — which
 * keeps it directly loadable by `node --test`, the same shape as the other
 * render-level suites in `tests/`.
 */

export type WorkKind = 'Design Request' | 'CG Request' | 'Content Schedule'

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

/**
 * Which channels can actually reach this person.
 *
 * The whole point: a missing Slack id must never mean "notify nobody". It only
 * means "no Slack" — the email still goes.
 */
export function resolveStatusDelivery(person: { slack_user_ids?: unknown; email?: unknown }): {
  slackUserId: string | null
  email: string | null
} {
  const ids = Array.isArray(person.slack_user_ids) ? person.slack_user_ids : []
  const firstSlack = ids.find((id) => typeof id === 'string' && id.trim().length > 0)
  const rawEmail = typeof person.email === 'string' ? person.email.trim() : ''
  return {
    slackUserId: typeof firstSlack === 'string' ? firstSlack.trim() : null,
    email: rawEmail.includes('@') ? rawEmail : null,
  }
}

/**
 * Subject + brand-shell inputs for a status-change notice. Pure — no sending,
 * and no brand wrapper: the caller passes `bodyHtml`/`subtitle` to
 * `brandedEmail` so this stays import-free and testable.
 */
export function renderStatusEmail(opts: {
  fullName: string | null
  kind: WorkKind
  title: string
  statusLabel: string
  previousLabel: string | null
  url: string
}): { subject: string; title: string; subtitle: string; bodyHtml: string } {
  const firstName = (opts.fullName || '').trim().split(/\s+/)[0] || 'there'
  const safeFirstName = escapeHtml(firstName)
  const movement = opts.previousLabel
    ? `moved from <strong>${escapeHtml(opts.previousLabel)}</strong> to <strong>${escapeHtml(opts.statusLabel)}</strong>`
    : `is now <strong>${escapeHtml(opts.statusLabel)}</strong>`

  const bodyHtml = `
    <p style="margin:0 0 14px">Hi ${safeFirstName},</p>
    <p style="margin:0 0 16px">A ${escapeHtml(opts.kind.toLowerCase())} you are assigned to ${movement}.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:14px;color:#111827;margin:0 0 20px">
      <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap">Ticket</td><td style="padding:6px 0;font-weight:600">${escapeHtml(opts.title)}</td></tr>
      <tr><td style="padding:6px 14px 6px 0;color:#6b7280;white-space:nowrap">Status</td><td style="padding:6px 0">${escapeHtml(opts.statusLabel)}</td></tr>
    </table>
    <a href="${encodeURI(opts.url)}" style="display:inline-block;background:#002C73;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px">Open the ticket</a>
    <p style="margin:18px 0 0;font-size:12px;color:#9ca3af">Or copy this link: ${escapeHtml(opts.url)}</p>
  `

  return {
    subject: `${opts.kind} status: ${opts.title} — ${opts.statusLabel}`,
    title: 'Status updated',
    subtitle: `${escapeHtml(opts.title)} · now ${escapeHtml(opts.statusLabel)}`,
    bodyHtml,
  }
}
