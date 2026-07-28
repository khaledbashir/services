import { query } from '@/lib/db'
import type { Skill } from '@/lib/ai/types'
import { createRequest } from '@/lib/request-hub/core'
import { getHubConfig } from '@/lib/request-hub/config'
import { dmRequesterConfirmation, postIntakeCard, requestUrl } from '@/lib/request-hub/slack'

const skill: Skill = {
  name: 'create_hub_request',
  description:
    'Submit a request to the ANC Request Hub (new idea, new build, change to something existing, or bug/problem). Use when someone wants to request work, report a problem with a platform, or suggest an improvement. Returns the request number and link.',
  category: 'Service Ops',
  icon: '📥',
  parameters: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['idea', 'build', 'change', 'bug'],
        description: 'What kind of request this is',
      },
      title: { type: 'string', description: 'Short title (under 80 chars)' },
      description: { type: 'string', description: 'What is wanted, in the requester\'s words' },
      problem: { type: 'string', description: 'The problem it solves (optional)' },
      deadline: { type: 'string', description: 'Real deadline as YYYY-MM-DD, only if one was stated' },
    },
    required: ['type', 'title', 'description'],
  },
  async handler(args, ctx) {
    const staffRes = await query(`SELECT full_name, email FROM staff WHERE id = $1`, [ctx.userId])
    const staff = staffRes.rows[0]
    const answers: Record<string, unknown> = { want: String(args.description) }
    if (args.problem) answers.problem = String(args.problem)

    const req = await createRequest({
      type: String(args.type),
      status: 'submitted',
      title: String(args.title).slice(0, 120),
      summary: String(args.description).slice(0, 1000),
      answers,
      deadline: args.deadline ? String(args.deadline) : null,
      requester: {
        userId: ctx.userId,
        fullName: ctx.userName || staff?.full_name || null,
        email: staff?.email || null,
      },
      source: ctx.channel === 'slack' ? 'slack_command' : 'web',
    })

    const config = await getHubConfig()
    // The Slack assistant formats its own reply — skip the confirmation DM in
    // that case, but the leadership intake card always posts.
    if (ctx.channel !== 'slack') {
      dmRequesterConfirmation(req, config).catch(() => {})
    }
    postIntakeCard(req, config).catch(() => {})

    return {
      request_number: req.request_number,
      id: req.id,
      url: requestUrl(req.id),
      status: req.status,
      text_summary: `Request ${req.request_number} submitted — ${config.responseTimeText} Track it: ${requestUrl(req.id)}`,
    }
  },
}
export default skill
