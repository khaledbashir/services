import type { Skill } from '@/lib/ai/types'
import { triage, markStarted, markShipped, markQuoted, hoursThisMonth } from '@/lib/service-triage'
import { query } from '@/lib/db'

// Triage a Slack/email/etc. paste. Classifies as FIX vs NEW, identifies the
// platform area, estimates realistic hours from past tracked requests + git
// history, and persists the entry against the service-contract ledger so
// the 12-hr/month retainer cap deducts on ship.
const triageSkill: Skill = {
  name: 'triage_service_request',
  description: 'Classify an incoming Slack request as FIX vs NEW, give a real-data hours estimate, and log it against the service-contract retainer. Use whenever a stakeholder pastes a request and you need to know fix-or-new + how long.',
  category: 'Service Ops',
  icon: '🧾',
  role: 'manager',
  parameters: {
    type: 'object',
    properties: {
      raw_text: { type: 'string', description: 'The Slack/email/ticket paste to triage. Include the full message; quoted threads are fine.' },
      requester: { type: 'string', description: 'Name of the person who sent the request (Joe, Charlie, Alexis, etc.). Optional.' },
      source: { type: 'string', description: "Channel the request came from: 'slack', 'email', 'voicemail', 'meeting', 'manual'. Default: manual." },
      source_url: { type: 'string', description: 'Slack permalink, email URL, or ticket URL. Optional.' },
    },
    required: ['raw_text'],
  },
  async handler(args, ctx) {
    const result = await triage({
      raw_text: String(args.raw_text || ''),
      requester: typeof args.requester === 'string' ? args.requester : undefined,
      source: typeof args.source === 'string' ? args.source : 'slack',
      source_url: typeof args.source_url === 'string' ? args.source_url : undefined,
      created_by: ctx.userId,
    })

    const lines: string[] = []
    lines.push(`*${result.classification}* — ${result.confidence} confidence (${result.confidence_score}/10)`)
    if (result.repo && result.area) lines.push(`Area: \`${result.repo}/${result.area}\``)
    lines.push(`Summary: ${result.summary}`)
    lines.push(`Estimated: *${result.estimate.hours_low}–${result.estimate.hours_high}h* (${result.estimate.source}${result.estimate.sample_size ? `, n=${result.estimate.sample_size}` : ''})`)
    lines.push(`Retainer: ${result.retainer_covered ? '✅ covered (deducts from 12-hr cap on ship)' : '🟡 NEW scope — separate fixed-price quote'}`)
    lines.push(`Next: ${result.next_action}`)
    lines.push(`_Logged as ${result.id}_`)
    lines.push('')
    lines.push('*Paste-ready reply to the requester:*')
    lines.push('```')
    lines.push(result.stakeholder_message)
    lines.push('```')

    return {
      ...result,
      text_summary: lines.join('\n'),
      _ui_action: { type: 'navigate', to: `/service-log/${result.id}` },
    }
  },
}

// Mark a logged request as shipped so the actual hours deduct from the cap.
const shipSkill: Skill = {
  name: 'ship_service_request',
  description: 'Mark a service request as shipped with the real hours spent. Deducts from the 12-hr/month retainer cap. Use after a fix is live and verified.',
  category: 'Service Ops',
  icon: '🚀',
  role: 'manager',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Service-request UUID returned by triage_service_request.' },
      actual_hours: { type: 'number', description: 'Real hours spent on this request (round to 0.25h).' },
      shipped_commit_sha: { type: 'string', description: 'Optional git SHA of the shipping commit.' },
      notes: { type: 'string', description: 'Optional close-out note.' },
    },
    required: ['id', 'actual_hours'],
  },
  async handler(args) {
    const id = String(args.id)
    const actual_hours = Number(args.actual_hours)
    const shipped_commit_sha = typeof args.shipped_commit_sha === 'string' ? args.shipped_commit_sha : undefined
    const notes = typeof args.notes === 'string' ? args.notes : undefined
    await markShipped(id, { actual_hours, shipped_commit_sha, notes })
    const meter = await hoursThisMonth()
    return {
      id,
      shipped: true,
      actual_hours,
      meter,
      text_summary: `Shipped \`${id.slice(0, 8)}\` — ${actual_hours}h logged. This month: *${meter.hours_used}h / ${meter.cap_hours}h cap*${meter.overage_hours ? ` (${meter.overage_hours}h overage @ $90/hr = $${meter.overage_hours * 90})` : ''}.`,
      _ui_action: { type: 'refresh' },
    }
  },
}

const startSkill: Skill = {
  name: 'start_service_request',
  description: 'Mark a triaged service request as in-progress. Stamps started_at if not already set.',
  category: 'Service Ops',
  icon: '▶️',
  role: 'manager',
  parameters: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async handler(args) {
    const id = String(args.id)
    await markStarted(id)
    return { id, started: true, text_summary: `Started \`${id.slice(0, 8)}\`.`, _ui_action: { type: 'refresh' } }
  },
}

const quoteSkill: Skill = {
  name: 'quote_service_request',
  description: 'Mark a NEW-scope request as quoted with a fixed-price number (out of retainer). Use after sending the scope doc.',
  category: 'Service Ops',
  icon: '💵',
  role: 'manager',
  parameters: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      quote_amount: { type: 'number', description: 'Fixed-price quote in USD.' },
      notes: { type: 'string', description: 'Scope-doc link or summary.' },
    },
    required: ['id'],
  },
  async handler(args) {
    const id = String(args.id)
    const quote_amount = typeof args.quote_amount === 'number' ? args.quote_amount : undefined
    const notes = typeof args.notes === 'string' ? args.notes : undefined
    await markQuoted(id, { quote_amount, notes })
    return {
      id,
      quoted: true,
      quote_amount,
      text_summary: `Quoted \`${id.slice(0, 8)}\`${quote_amount ? ` at $${quote_amount}` : ''}.`,
      _ui_action: { type: 'refresh' },
    }
  },
}

const meterSkill: Skill = {
  name: 'service_retainer_meter',
  description: "Show this month's retainer utilization — hours used vs the 12-hr cap, plus open estimated hours and overage at $90/hr.",
  category: 'Service Ops',
  icon: '⏱️',
  role: 'manager',
  parameters: { type: 'object', properties: {} },
  async handler() {
    const meter = await hoursThisMonth()
    const remaining = Math.max(0, meter.cap_hours - meter.hours_used)
    return {
      ...meter,
      hours_remaining: Math.round(remaining * 10) / 10,
      text_summary: `*${meter.month}*: ${meter.hours_used}h shipped / ${meter.cap_hours}h cap (${remaining}h remaining)${meter.hours_estimated_open ? ` · ${meter.hours_estimated_open}h estimated on open work` : ''}${meter.overage_hours ? ` · *${meter.overage_hours}h overage* @ $90/hr = $${meter.overage_hours * 90}` : ''}.`,
    }
  },
}

const listSkill: Skill = {
  name: 'list_service_requests',
  description: 'List recent triaged service requests, optionally filtered by status or month. Default: last 25 across all statuses.',
  category: 'Service Ops',
  icon: '📋',
  role: 'manager',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', 'in_progress', 'shipped', 'quoted', 'cancelled'] },
      classification: { type: 'string', enum: ['FIX', 'NEW', 'MIXED'] },
      month: { type: 'string', description: 'YYYY-MM' },
      limit: { type: 'number', default: 25 },
    },
  },
  async handler(args) {
    const where: string[] = []
    const params: any[] = []
    if (typeof args.status === 'string') { params.push(args.status); where.push(`status = $${params.length}`) }
    if (typeof args.classification === 'string') { params.push(args.classification); where.push(`classification = $${params.length}`) }
    if (typeof args.month === 'string' && /^\d{4}-\d{2}$/.test(args.month)) {
      params.push(args.month + '-01')
      where.push(`received_at >= $${params.length}::date AND received_at < ($${params.length}::date + INTERVAL '1 month')`)
    }
    const limit = Math.min(200, Math.max(1, Number(args.limit) || 25))
    const sql = `SELECT id, received_at, classification, repo, area, summary, status, estimated_hours, actual_hours, retainer_covered, requester
                 FROM service_requests
                 ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                 ORDER BY received_at DESC
                 LIMIT ${limit}`
    const r = await query(sql, params)
    return { count: r.rows.length, requests: r.rows }
  },
}

export default triageSkill
export const skills = [triageSkill, startSkill, shipSkill, quoteSkill, meterSkill, listSkill]
