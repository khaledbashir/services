/**
 * compose_newsletter — the Marketing Agent Studio's compose capability as a
 * reusable AI skill (rule 7/15: every AI build ships as a skill, so the same
 * capability is reachable from the dashboard assistant, OpenClaw Slack via
 * /api/ai/invoke, and mirrors to the CRM AI).
 *
 * Runs the exact studio pipeline: live marketing context → ANC-voice draft →
 * branded visual document → persisted history run. Returns the studio link so
 * a human reviews the render before anything ships — this skill never sends.
 */
import type { Skill } from '@/lib/ai/types'
import { loadMarketingComposeContext } from '@/lib/marketing/compose-context'
import { generateCampaignArtifact } from '@/lib/marketing/compose-generate'
import { recordComposeRun } from '@/lib/marketing/compose-runs'

const skill: Skill = {
  name: 'compose_newsletter',
  description:
    'Draft a complete ANC marketing newsletter from a brief: ANC-voice copy, branded layout with real installation photography, and social variants. The draft is saved to the Marketing Studio history for review and approval — nothing is sent.',
  role: 'manager',
  parameters: {
    type: 'object',
    properties: {
      brief: {
        type: 'string',
        description: 'What the newsletter should cover: audience, venue/partner, moment, call to action.',
      },
      audience: {
        type: 'string',
        description: 'Optional audience name to target (matched against marketing audiences).',
      },
    },
    required: ['brief'],
  },
  async handler(args, ctx) {
    const brief = String(args.brief || '').trim()
    if (!brief) {
      return { ok: false, error: { code: 'missing_brief', message: 'Tell me what the newsletter should cover.' } }
    }

    const context = await loadMarketingComposeContext()
    const audienceQuery = String(args.audience || '').trim().toLowerCase()
    const audience = audienceQuery
      ? context.audiences.find((a) => a.name.toLowerCase().includes(audienceQuery))
      : context.audiences.find((a) => a.name.includes('Media & Partnerships')) || context.audiences[0]

    const { artifact, visual } = await generateCampaignArtifact({
      brief,
      audienceName: audience?.name,
      context,
    })

    const runId = await recordComposeRun({
      createdBy: ctx?.userId || null,
      brief,
      artifact,
      visual,
      audienceId: audience?.id || null,
      audienceName: audience?.name || null,
    })

    const studioUrl = 'https://services.ancsports.net/marketing-hub/studio'
    return {
      ok: true,
      subject: artifact.subject,
      preview_text: artifact.previewText,
      sections: artifact.sections.map((s) => ({ type: s.type, headline: s.headline })),
      social: artifact.social,
      audience: audience?.name || null,
      run_id: runId,
      review_url: studioUrl,
      text_summary: `Newsletter drafted: “${artifact.subject}” (${artifact.sections.length} sections, audience: ${audience?.name || 'default'}). Saved to Marketing Studio history — review at ${studioUrl} (History tab).`,
    }
  },
}

export default skill
