/**
 * Generation history for the Release Kit.
 * HARD RULE (Ahmad 7/15): anything generated gets its own persisted history with
 * previews — a run must never exist only until the tab closes.
 */
import { query } from '@/lib/db'
import type { ReleaseKit } from './release-kit'

let ready: Promise<void> | null = null

function ensureTable(): Promise<void> {
  if (!ready) {
    ready = query(`
      CREATE TABLE IF NOT EXISTS marketing_release_runs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        title text NOT NULL DEFAULT '',
        summary text NOT NULL DEFAULT '',
        source_name text,
        source_text text NOT NULL,
        kit jsonb NOT NULL,
        gap_count int NOT NULL DEFAULT 0,
        blocker_count int NOT NULL DEFAULT 0,
        provider text,
        model text,
        created_by text,
        campaign_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_release_runs_created
        ON marketing_release_runs(created_at DESC);
    `).then(() => undefined)
  }
  return ready
}

export type ReleaseRunSummary = {
  id: string
  title: string
  summary: string
  source_name: string | null
  gap_count: number
  blocker_count: number
  created_by: string | null
  created_at: string
}

export async function recordReleaseRun(input: {
  kit: ReleaseKit
  sourceText: string
  sourceName?: string | null
  provider?: string
  model?: string
  createdBy?: string | null
}): Promise<string> {
  await ensureTable()
  const { kit } = input
  const res = await query(
    `INSERT INTO marketing_release_runs
       (title, summary, source_name, source_text, kit, gap_count, blocker_count, provider, model, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING id`,
    [
      kit.title,
      kit.summary,
      input.sourceName || null,
      input.sourceText,
      JSON.stringify(kit),
      kit.gaps.length,
      kit.gaps.filter(g => g.severity === 'blocker').length,
      input.provider || null,
      input.model || null,
      input.createdBy || null,
    ],
  )
  return res.rows[0].id as string
}

export async function listReleaseRuns(limit = 40): Promise<ReleaseRunSummary[]> {
  await ensureTable()
  const res = await query(
    `SELECT id, title, summary, source_name, gap_count, blocker_count, created_by, created_at
       FROM marketing_release_runs
      ORDER BY created_at DESC
      LIMIT $1`,
    [limit],
  )
  return res.rows as ReleaseRunSummary[]
}

export async function getReleaseRun(id: string) {
  await ensureTable()
  const res = await query(
    `SELECT id, title, summary, source_name, source_text, kit, provider, model,
            created_by, campaign_id, created_at
       FROM marketing_release_runs WHERE id = $1`,
    [id],
  )
  return res.rows[0] || null
}

export async function attachCampaign(runId: string, campaignId: string) {
  await ensureTable()
  await query(`UPDATE marketing_release_runs SET campaign_id = $2 WHERE id = $1`, [runId, campaignId])
}
