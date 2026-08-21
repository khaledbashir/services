/**
 * The ANC ticket notification email shell.
 *
 * Pure and self-contained so the exact email a client receives can be rendered
 * and looked at without a database — and so its wording is under test.
 *
 * The footer used to sign off "ANC Sports Operations"; Jireh dropped "Sports"
 * on 2026-08-21.
 */
export const EMAIL_FOOTER_SIGNOFF = 'This is an automated notification from ANC Operations.'
export const EMAIL_REPLY_HINT = 'Reply to this email to add a comment to this ticket.'

/**
 * Build the standard ANC ticket email HTML template.
 */
export function ticketEmailHtml(caseNum: string, title: string, venueName: string, bodyContent: string): string {
  return `<div style="font-family:sans-serif;max-width:600px">
    <div style="background:#002C73;color:white;padding:20px 24px;border-radius:8px 8px 0 0">
      <h2 style="margin:0;font-size:16px">Case ${caseNum} — ${title}</h2>
      <p style="margin:4px 0 0;opacity:0.7;font-size:13px">${venueName}</p>
    </div>
    <div style="border:1px solid #e2e8f0;border-top:none;padding:20px 24px;border-radius:0 0 8px 8px">
      ${bodyContent}
      <hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">
      <p style="margin:0;font-size:12px;color:#94a3b8">${EMAIL_REPLY_HINT}</p>
      <p style="margin:0;font-size:12px;color:#94a3b8">${EMAIL_FOOTER_SIGNOFF}</p>
    </div>
  </div>`
}
