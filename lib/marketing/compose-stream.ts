import { loadMarketingComposeContext } from '@/lib/marketing/compose-context'
import {
  artifactToVisualDocument,
  generateCampaignArtifact,
  type GeneratedCampaignArtifact,
} from '@/lib/marketing/compose-generate'
import { recordComposeRun } from '@/lib/marketing/compose-runs'
import {
  DEFAULT_NEWSLETTER_VISUAL,
  exportNewsletterFullHtml,
  type NewsletterVisualDocument,
  type NewsletterSection,
} from '@/lib/marketing/newsletter-visual'

export type ComposeStreamEvent =
  | { type: 'agent'; text: string }
  | { type: 'status'; step: string; detail?: string }
  | { type: 'context'; stats: { subscribed: number; newsletterActive: number; crmLinkedPct: number } }
  | { type: 'outline'; items: string[] }
  | { type: 'section'; index: number; label: string; section: NewsletterSection }
  | { type: 'social'; platform: 'linkedin' | 'x' | 'slack'; text: string }
  | { type: 'preview'; subject: string; previewText: string; html: string }
  | {
      type: 'done'
      artifact: GeneratedCampaignArtifact
      visual: NewsletterVisualDocument
      audienceId: string | null
      audienceName: string | null
      runId?: string | null
    }
  | { type: 'error'; message: string }

export type ComposeStreamWriter = (event: ComposeStreamEvent) => void

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function sectionLabel(section: NewsletterSection) {
  return section.headline || section.eyebrow || section.type
}

function buildPartialVisual(
  base: Pick<NewsletterVisualDocument, 'subject' | 'previewText'>,
  sections: NewsletterSection[],
): NewsletterVisualDocument {
  return {
    version: 1,
    theme: 'ancNewsletter',
    subject: base.subject,
    previewText: base.previewText,
    sections,
  }
}

export async function runComposeStream(input: {
  brief: string
  audienceId?: string | null
  userId?: string | null
  write: ComposeStreamWriter
}) {
  const brief = input.brief.trim()
  if (!brief) {
    input.write({ type: 'error', message: 'Tell me what marketing should ship.' })
    return
  }

  input.write({ type: 'agent', text: 'On it. I’ll pull live marketing context, draft the newsletter, and render it in the sandbox.' })
  input.write({ type: 'status', step: 'context', detail: 'Reading HubSpot-imported audiences and recent campaigns…' })

  const context = await loadMarketingComposeContext()
  const audience = input.audienceId
    ? context.audiences.find((row) => row.id === input.audienceId)
    : context.audiences.find((a) => a.name.includes('Media & Partnerships')) || context.audiences[0]

  const subscribed = Number(context.summary.contacts?.subscribed ?? 0)
  const newsletterActive = audience?.member_count ?? 0
  const totalContacts = Number(context.summary.contacts?.total ?? 0)
  const crmLinked = context.audiences.length ? Math.round((subscribed / Math.max(totalContacts, 1)) * 100) : 0

  input.write({
    type: 'context',
    stats: { subscribed, newsletterActive, crmLinkedPct: crmLinked },
  })
  input.write({
    type: 'agent',
    text: `Context loaded — ${subscribed.toLocaleString()} send-safe contacts, ${newsletterActive.toLocaleString()} in ${audience?.name || 'the selected audience'}.`,
  })

  input.write({ type: 'status', step: 'generate', detail: 'Writing ANC voice copy and layout blocks…' })

  let artifact: GeneratedCampaignArtifact
  let visual: NewsletterVisualDocument
  try {
    const result = await generateCampaignArtifact({
      brief,
      audienceName: audience?.name,
      context,
    })
    artifact = result.artifact
    visual = result.visual
  } catch (err) {
    input.write({ type: 'error', message: err instanceof Error ? err.message : 'Generation failed' })
    return
  }

  const outline = [
    artifact.subject,
    ...artifact.sections.map((s) => s.headline || s.eyebrow || s.type).filter(Boolean),
    'LinkedIn + X + Slack variants',
  ].slice(0, 6)

  input.write({ type: 'outline', items: outline })
  input.write({ type: 'agent', text: `Outline locked. Subject line: “${artifact.subject}”. Rendering blocks now.` })

  const revealed: NewsletterSection[] = []
  for (let index = 0; index < visual.sections.length; index++) {
    const section = visual.sections[index]
    revealed.push(section)
    input.write({
      type: 'section',
      index,
      label: sectionLabel(section),
      section,
    })
    input.write({
      type: 'preview',
      subject: visual.subject || artifact.subject,
      previewText: visual.previewText || artifact.previewText,
      html: exportNewsletterFullHtml(buildPartialVisual(visual, [...revealed])),
    })
    await sleep(index === 0 ? 120 : 280)
  }

  input.write({ type: 'status', step: 'social', detail: 'Splitting social variants…' })
  for (const platform of ['linkedin', 'x', 'slack'] as const) {
    const text = artifact.social[platform]
    if (!text) continue
    input.write({ type: 'social', platform, text })
    await sleep(200)
  }

  input.write({
    type: 'agent',
    text: 'Sandbox is ready. Review the render, then ship for approval when it looks right.',
  })

  // Persist the run BEFORE announcing done, so the history entry always exists
  // by the time the UI shows the finished render.
  const runId = await recordComposeRun({
    createdBy: input.userId,
    brief,
    artifact,
    visual,
    audienceId: audience?.id || null,
    audienceName: audience?.name || null,
  })

  input.write({
    type: 'done',
    artifact,
    visual,
    audienceId: audience?.id || null,
    audienceName: audience?.name || null,
    runId,
  })
}

/** Build a blank sandbox state for idle UI */
export function emptySandboxVisual(): NewsletterVisualDocument {
  return {
    ...DEFAULT_NEWSLETTER_VISUAL,
    subject: 'Your campaign will appear here',
    previewText: 'Describe what marketing should ship in the chat.',
    sections: [],
  }
}

/** Quick partial rebuild when user edits aren't in scope — export helper */
export function visualFromArtifact(artifact: GeneratedCampaignArtifact) {
  return artifactToVisualDocument(artifact)
}
