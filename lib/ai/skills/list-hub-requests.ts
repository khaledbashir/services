import type { Skill } from '@/lib/ai/types'
import { listRequests } from '@/lib/request-hub/core'
import { getHubConfig } from '@/lib/request-hub/config'
import { resolveHubPermissions, canSeeAll } from '@/lib/request-hub/roles'
import { requestUrl } from '@/lib/request-hub/slack'

const skill: Skill = {
  name: 'list_hub_requests',
  description:
    'List Request Hub requests (ideas, builds, changes, problems) with their status. Use to answer "what did I request", "what requests are open", or "what is the status of REQ-...". Non-leadership callers only see their own requests.',
  category: 'Service Ops',
  icon: '🗂️',
  parameters: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'Filter by status key (e.g. submitted, in_progress, completed)' },
      q: { type: 'string', description: 'Search term across title/summary/request number' },
      mine_only: { type: 'boolean', description: 'Only the caller\'s own requests' },
    },
  },
  async handler(args, ctx) {
    const config = await getHubConfig()
    const perms = resolveHubPermissions(
      { userId: ctx.userId, fullName: ctx.userName || '', role: ctx.userRole },
      config
    )
    const seeAll = canSeeAll(perms) && !args.mine_only
    const rows = await listRequests({
      status: args.status ? String(args.status) : null,
      search: args.q ? String(args.q) : null,
      scopeToRequesterId: seeAll ? null : ctx.userId,
      limit: 25,
    })
    const requests = rows.map((r) => ({
      request_number: r.request_number,
      title: r.title,
      type: r.type,
      status: r.status,
      requester: r.requester_name,
      owner: r.owner_name,
      url: requestUrl(r.id),
    }))
    return {
      requests,
      text_summary:
        requests.length === 0
          ? 'No matching requests.'
          : requests
              .slice(0, 10)
              .map((r) => `${r.request_number} ${r.title || ''} — ${r.status}`)
              .join(' · '),
    }
  },
}
export default skill
