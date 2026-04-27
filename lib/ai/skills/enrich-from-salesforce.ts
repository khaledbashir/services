import type { Skill } from '@/lib/ai/types'
import { SkillError } from '@/lib/ai/types'

/**
 * Mirror of the Twenty Scout skill `enrich-from-salesforce`. Wired so any
 * @ANC user in Slack can ask "enrich the Charlotte Hornets opp from
 * Salesforce" and have empty Twenty fields auto-filled from the legacy SF org.
 *
 * Implementation invokes the Twenty logic function `enrich-from-salesforce`
 * directly via Twenty's metadata GraphQL `executeOneLogicFunction` mutation —
 * keeps Scout and Slack on the same code path so they can never drift.
 *
 * Read-only on the Salesforce side — never writes to SF.
 */

const TWENTY_BASE = process.env.TWENTY_BASE_URL || 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_TOKEN = process.env.TWENTY_API_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJkM2ZiYzI5YS1hNjM1LTQ4YjctOWQ2ZS0yNTA5NDE2NzdmZDAiLCJ0eXBlIjoiQVBJX0tFWSIsIndvcmtzcGFjZUlkIjoiZDNmYmMyOWEtYTYzNS00OGI3LTlkNmUtMjUwOTQxNjc3ZmQwIiwiaWF0IjoxNzc0ODEwNDkyLCJleHAiOjQ5Mjg0MTA0ODcsImp0aSI6IjYxMGEzMWEzLTJhMDgtNDM5MC1iMTU1LTFkN2M3NzY5Y2QxOSJ9.nzknS-bBNuf7y3LUCv2xEa5-9xuJNHBK3GalJwWK3eA'

const LOGIC_FN_ID = 'bd8eb28f-3c9d-4e60-9aa9-eb4e6f16d4ff'

type ObjectType = 'Opportunity' | 'Company' | 'Person'

const skill: Skill = {
  name: 'enrich_from_salesforce',
  description:
    "Pull data from the legacy Salesforce org (read-only) for a Twenty record and fill in any empty fields. Default mode previews the diff (proposed updates + conflicts where Twenty already has a value); pass apply=true to actually write the fillable updates to Twenty. Never overwrites existing Twenty values, never writes to Salesforce. Match is by name (Opportunity / Company) or email (Person). Use this when a user asks 'enrich [record]', 'what's missing in SF', 'pull from Salesforce', 'fill in the gaps from SF'.",
  category: 'System',
  icon: '🔄',
  parameters: {
    type: 'object',
    properties: {
      recordId: {
        type: 'string',
        description: 'Twenty record UUID to enrich.',
      },
      objectType: {
        type: 'string',
        enum: ['Opportunity', 'Company', 'Person'],
        description: 'Twenty object type. Defaults to Opportunity.',
      },
      apply: {
        type: 'boolean',
        description:
          'If true, actually patch the Twenty record with the proposed updates. Default false (preview-only). Always preview first; only apply after the user confirms.',
      },
      matchValue: {
        type: 'string',
        description:
          'Optional override: explicit name (or email for Person) to match against SF. Defaults to the record\'s name or primary email.',
      },
    },
    required: ['recordId'],
  },
  async handler(args) {
    const recordId = String(args.recordId || '').trim()
    if (!recordId) {
      throw new SkillError(
        'missing_record_id',
        'recordId is required (Twenty UUID of the record to enrich).',
        'Provide the Twenty UUID of the Opportunity / Company / Person to enrich.',
      )
    }
    const objectType = (String(args.objectType || 'Opportunity') as ObjectType)
    if (!['Opportunity', 'Company', 'Person'].includes(objectType)) {
      throw new SkillError(
        'invalid_object_type',
        `objectType must be Opportunity, Company, or Person (got "${args.objectType}")`,
      )
    }
    const apply = Boolean(args.apply)
    const matchValue = args.matchValue ? String(args.matchValue) : undefined

    const payload: Record<string, unknown> = { recordId, objectType, apply }
    if (matchValue) payload.matchValue = matchValue

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
        variables: { input: { id: LOGIC_FN_ID, payload } },
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

    if (result.matched === false) {
      return {
        matched: false,
        reason: result.reason,
        candidates: result.candidates,
        next_step: result.candidates
          ? 'Multiple SF records match this name — ask the user which Salesforce Id to use.'
          : 'No matching Salesforce record found. Confirm the name spelling or check if the record was created post-migration (won\'t exist in SF).',
      }
    }

    return {
      matched: true,
      twenty_id: result.twentyId,
      sf_id: result.sfId,
      matched_on: result.matchedOn,
      summary: result.summary,
      fillable: result.fillable,
      conflicts: result.conflicts,
      proposed_updates: result.proposedUpdates,
      apply: result.apply,
      applied_result: result.appliedResult,
      next_step: result.nextStep,
    }
  },
}

export default skill
