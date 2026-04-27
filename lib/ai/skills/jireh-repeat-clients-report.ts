import type { Skill } from '@/lib/ai/types'
import { SkillError } from '@/lib/ai/types'

/**
 * Mirror of the Twenty Scout skill `repeat-clients-report`. Wired so any
 * @ANC user in Slack can ask Jireh's "top repeat clients in vertical" report
 * and get the same xlsx Scout would return.
 *
 * Implementation invokes the Twenty logic function `generate-repeat-clients-report`
 * directly via Twenty's metadata GraphQL `executeOneLogicFunction` mutation —
 * keeps Scout and Slack on the same code path so they can never drift.
 */

const TWENTY_BASE = process.env.TWENTY_BASE_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_TOKEN = process.env.TWENTY_API_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA'

const LOGIC_FN_ID = '8acf4271-f0a6-46fa-9b0c-cceb55cb9b6a'

const skill: Skill = {
  name: 'jireh_repeat_clients_report',
  description:
    "Generate Jireh's Repeat Clients Excel — top accounts in a vertical (Technology, Venue Services, or Media & Sponsorship) by lifetime won revenue, with margin %, first year of engagement, and total won opp count. Returns a download link to the .xlsx file. Same data + format Scout returns in Twenty CRM.",
  category: 'System',
  icon: '📊',
  parameters: {
    type: 'object',
    properties: {
      vertical: {
        type: 'string',
        enum: ['TECHNOLOGY', 'VENUE_SERVICES', 'MEDIA_SPONSORSHIP'],
        description:
          'Which ANC business vertical to report on. TECHNOLOGY covers Equipment + LiveSync HW/SW; VENUE_SERVICES covers Service contracts; MEDIA_SPONSORSHIP covers Ad Sales. Default TECHNOLOGY.',
      },
      top: {
        type: 'integer',
        minimum: 1,
        maximum: 50,
        description: 'How many top clients to include (1-50). Default 25.',
      },
    },
  },
  async handler(args) {
    const verticalRaw = String(args.vertical || 'TECHNOLOGY').toUpperCase()
    if (!['TECHNOLOGY', 'VENUE_SERVICES', 'MEDIA_SPONSORSHIP'].includes(verticalRaw)) {
      throw new SkillError(
        'invalid_vertical',
        `Vertical must be TECHNOLOGY, VENUE_SERVICES, or MEDIA_SPONSORSHIP (got "${verticalRaw}")`,
        'Try one of: TECHNOLOGY, VENUE_SERVICES, MEDIA_SPONSORSHIP',
      )
    }
    const top = Math.max(1, Math.min(50, Number(args.top) || 25))

    const res = await fetch(`${TWENTY_BASE}/metadata`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TWENTY_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: `mutation E($input: ExecuteOneLogicFunctionInput!) {
          executeOneLogicFunction(input: $input) { data status error }
        }`,
        variables: {
          input: {
            id: LOGIC_FN_ID,
            payload: { vertical: verticalRaw, top },
          },
        },
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      throw new SkillError(
        'twenty_logic_function_http_error',
        `Twenty executeOneLogicFunction returned ${res.status}: ${body.slice(0, 300)}`,
      )
    }
    const json = await res.json()
    if (json.errors?.length) {
      throw new SkillError(
        'twenty_logic_function_graphql_error',
        json.errors.map((e: { message: string }) => e.message).join('; '),
      )
    }
    const wrapper = json?.data?.executeOneLogicFunction
    if (wrapper?.status === 'ERROR' || wrapper?.error) {
      throw new SkillError(
        'twenty_logic_function_returned_error',
        wrapper.error?.errorMessage || JSON.stringify(wrapper.error) || 'Twenty logic function failed',
      )
    }
    const result = wrapper?.data
    if (!result || result.error) {
      throw new SkillError(
        'twenty_logic_function_no_data',
        result?.error || 'Twenty logic function returned no data payload',
      )
    }
    return {
      vertical: result.vertical,
      top: result.top,
      filename: result.filename,
      url: result.url,
      repeat_clients: result.repeatClients,
      total_opps: result.totalOpps,
      markdown_link: result.markdownToEmbed,
    }
  },
}

export default skill
