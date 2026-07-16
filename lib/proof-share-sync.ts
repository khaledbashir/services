/**
 * Keeps an FTP-backed proof share's stored file manifest in step with the
 * remote folder it points at. Designers revise proofs by replacing files
 * INSIDE the folder — the share link must stay stable while its contents
 * follow the folder. Used by the explicit "Refresh files" endpoint and by
 * the public viewer's freshness pass (TTL-gated) so clients see revisions
 * without anyone re-creating the link.
 */

import { query } from '@/lib/db'
import {
  archiveSupersededProofDecisions,
  type FtpManifestEntry,
  listProofFiles,
  reconcileProofManifest,
} from '@/lib/proof-ftp'
import { prefetchManifest } from '@/lib/proof-file-cache'

/** How stale a manifest may be before a public view triggers a re-scan. */
export const SHARE_SYNC_TTL_MS = Math.max(
  15_000,
  Number(process.env.PROOF_SHARE_SYNC_TTL_MS || 60_000)
)

export type ShareSyncResult = {
  manifest: FtpManifestEntry[]
  added: number
  updated: number
  removed: number
  unchanged: number
  syncedAt: string
  fileResponses: Record<string, FileResponseDecision>
  clientResponse: 'approved' | 'changes_requested' | null
  approvalReset: boolean
}

export type FileResponseDecision = {
  response: 'approved' | 'changes_requested'
  note?: string | null
  name?: string | null
  at?: string | null
}

export function parseManifest(raw: unknown): FtpManifestEntry[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((entry): entry is FtpManifestEntry => {
    if (!entry || typeof entry !== 'object') return false
    const item = entry as Record<string, unknown>
    return typeof item.name === 'string' && item.name === item.name.split('/').pop()
  })
}

export function isManifestStale(lastSyncedAt: string | Date | null | undefined): boolean {
  if (!lastSyncedAt) return true
  const at = new Date(lastSyncedAt).getTime()
  return !Number.isFinite(at) || Date.now() - at > SHARE_SYNC_TTL_MS
}

// One sync per token at a time — public views of the same proof arrive in
// bursts and the legacy FTP dislikes concurrent directory commands.
const inFlight = new Map<string, Promise<ShareSyncResult>>()

export async function syncFtpShareManifest(
  token: string,
  folderPath: string,
  previousRaw: unknown
): Promise<ShareSyncResult> {
  const pending = inFlight.get(token)
  if (pending) return pending

  const run = (async (): Promise<ShareSyncResult> => {
    const files = await listProofFiles(folderPath)
    const current: FtpManifestEntry[] = files.map((file) => ({
      name: file.name,
      size: file.size,
      modifiedAt: file.modifiedAt,
      kind: file.kind || 'other',
      sourceVersion: file.sourceVersion || `${file.size}-${file.modifiedAt}`,
      active: true,
    }))
    const previous = parseManifest(previousRaw).map((entry) => ({
      ...entry,
      sourceVersion: entry.sourceVersion || `${entry.size}-${entry.modifiedAt}`,
      active: entry.active !== false,
    }))
    const syncedAt = new Date().toISOString()
    const result = reconcileProofManifest(previous, current, syncedAt)

    const decisionResult = await query(
      `SELECT file_responses, client_response FROM proof_shares WHERE token = $1`,
      [token]
    )
    const decisionRow = decisionResult.rows[0] || {}
    const existingResponses: Record<string, FileResponseDecision> =
      decisionRow.file_responses && typeof decisionRow.file_responses === 'object'
        ? { ...decisionRow.file_responses }
        : {}
    const archived = archiveSupersededProofDecisions({
      previous,
      manifest: result.manifest,
      fileResponses: existingResponses,
      archivedAt: syncedAt,
    })
    result.manifest = archived.manifest
    const nextResponses = archived.fileResponses

    const approvalReset = result.added > 0 || result.updated > 0

    await query(
      `UPDATE proof_shares
       SET ftp_manifest = $2::jsonb,
           ftp_last_synced_at = $3,
           file_responses = $4::jsonb,
           client_response = CASE WHEN $5 THEN NULL ELSE client_response END,
           client_response_at = CASE WHEN $5 THEN NULL ELSE client_response_at END,
           client_response_note = CASE WHEN $5 THEN NULL ELSE client_response_note END
       WHERE token = $1`,
      [token, JSON.stringify(result.manifest), syncedAt, JSON.stringify(nextResponses), approvalReset]
    )
    if (result.added || result.updated || result.removed) {
      console.info('[proof-share:sync]', JSON.stringify({
        token,
        added: result.added,
        updated: result.updated,
        removed: result.removed,
      }))
    }
    // Warm the local file cache so new/revised proofs stream fast on first view.
    prefetchManifest(folderPath, result.manifest)
    return {
      ...result,
      syncedAt,
      fileResponses: nextResponses,
      clientResponse: approvalReset ? null : (decisionRow.client_response || null),
      approvalReset,
    }
  })()

  inFlight.set(token, run)
  try {
    return await run
  } finally {
    inFlight.delete(token)
  }
}
