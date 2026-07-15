/**
 * Generation history for the Marketing Agent Studio.
 * HARD RULE (Ahmad 7/15): anything generated gets its own persisted history
 * with previews — a compose run must never exist only until the tab closes.
 * Every stream run is recorded here whether or not it gets staged.
 */
import { query } from '@/lib/db'
import type { GeneratedCampaignArtifact } from './compose-generate'
import type { NewsletterVisualDocument } from './newsletter-visual'

let ready: Promise<void> | null = null
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = query(`
      CREATE TABLE IF NOT EXISTS marketing_compose_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_by uuid,
        brief text NOT NULL,
        subject text NOT NULL DEFAULT '',
        preview_text text NOT NULL DEFAULT '',
        artifact jsonb NOT NULL,
        visual jsonb NOT NULL,
        audience_id uuid,
        audience_name text,
        status text NOT NULL DEFAULT 'generated',
        campaign_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_compose_runs_created ON marketing_compose_runs(created_at DESC);
    `).then(() => undefined)
  }
  return ready
}

export async function recordComposeRun(input: {
  createdBy?: string | null
  brief: string
  artifact: GeneratedCampaignArtifact
  visual: NewsletterVisualDocument
  audienceId?: string | null
  audienceName?: string | null
}): Promise<string | null> {
  try {
    await ensureTable()
    const r = await query(
      `INSERT INTO marketing_compose_runs (created_by, brief, subject, preview_text, artifact, visual, audience_id, audience_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [input.createdBy || null, input.brief, input.artifact.subject, input.artifact.previewText,
       JSON.stringify(input.artifact), JSON.stringify(input.visual), input.audienceId || null, input.audienceName || null])
    return r.rows[0]?.id || null
  } catch (err) {
    // History must never break generation — log and move on.
    console.error('[compose-runs] record failed:', err)
    return null
  }
}

export async function markRunStaged(runId: string, campaignId: string): Promise<void> {
  try {
    await ensureTable()
    await query(`UPDATE marketing_compose_runs SET status='staged', campaign_id=$2 WHERE id=$1`, [runId, campaignId])
  } catch (err) {
    console.error('[compose-runs] mark staged failed:', err)
  }
}

export async function listComposeRuns(limit = 40) {
  await ensureTable()
  const r = await query(
    `SELECT r.id, r.brief, r.subject, r.preview_text, r.audience_name, r.status, r.campaign_id, r.created_at,
            s.full_name AS author_name
     FROM marketing_compose_runs r LEFT JOIN staff s ON s.id = r.created_by
     ORDER BY r.created_at DESC LIMIT $1`, [limit])
  return r.rows
}

export async function getComposeRun(id: string) {
  await ensureTable()
  const r = await query(`SELECT * FROM marketing_compose_runs WHERE id=$1`, [id])
  return r.rows[0] || null
}
