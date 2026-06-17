/**
 * Signal approval flow.
 *
 * Pattern: one row in marketing_approval_requests + one signed link per approver
 * delivered as a Slack DM. Each link goes to /api/marketing/approvals/decide
 * which validates the token, records the decision, and updates the campaign
 * status when enough approvals come in.
 *
 * Why links instead of Slack interactive buttons? Buttons require a verified
 * Slack interactivity URL configured in the Slack app, signing secret
 * validation, and an extra round-trip endpoint. Links work immediately with
 * just the existing chat.postMessage scope.
 */
import { randomBytes } from 'crypto'

export interface Approver {
  slackId: string
  label: string
  // Optional email if Slack DM isn't reachable; falls back to DM via email lookup
  email?: string
}

/**
 * The default approver group for ANC marketing sends.
 * Slack user IDs to be filled in via env once Ahmad confirms them.
 * Fallback labels keep the flow working with placeholder IDs.
 */
export function defaultApprovers(): Approver[] {
  const raw = process.env.SIGNAL_APPROVERS || ''
  // Format: "U123:Marketing Lead,U456:Revenue Lead,U789:Executive Sponsor"
  if (!raw.trim()) {
    return [
      { slackId: 'PLACEHOLDER_MARKETING_LEAD', label: 'Marketing Lead' },
      { slackId: 'PLACEHOLDER_REVENUE_LEAD', label: 'Revenue Lead' },
      { slackId: 'PLACEHOLDER_EXECUTIVE_SPONSOR', label: 'Executive Sponsor' },
    ]
  }
  return raw.split(',').map((p) => {
    const [slackId, label] = p.split(':').map((s) => s.trim())
    return { slackId, label: label || slackId }
  }).filter((a) => a.slackId)
}

export function mintApprovalToken(): string {
  return randomBytes(24).toString('hex')
}

export function publicAppOrigin(): string {
  return process.env.PUBLIC_APP_URL || 'https://services.ancsports.net'
}

export function buildDecisionLink(token: string, decision: 'approve' | 'reject' | 'changes'): string {
  return `${publicAppOrigin()}/api/marketing/approvals/decide?token=${token}&decision=${decision}`
}
