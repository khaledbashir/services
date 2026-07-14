/**
 * Boot-time proof cache warmer.
 *
 * The proof file cache lives on container-local disk, so every deploy starts
 * cold. Rather than making the first viewer after a deploy eat the slow pull
 * from the legacy file server, we re-warm the folders of every share someone
 * is likely to open: recently created, recently synced, or recently viewed.
 * Runs once per process, off the request path, throttled by the prefetch
 * queue (one file at a time, fastGet per file).
 */

import { query } from '@/lib/db'
import { isConfigured } from '@/lib/proof-ftp'
import { prefetchManifest } from '@/lib/proof-file-cache'
import { parseManifest } from '@/lib/proof-share-sync'

const WARM_SHARE_LIMIT = Math.max(1, Number(process.env.PROOF_CACHE_WARM_SHARES || 12))
const WARM_WINDOW_DAYS = Math.max(1, Number(process.env.PROOF_CACHE_WARM_WINDOW_DAYS || 21))

let started = false

export function warmProofCacheOnBoot(): void {
  if (started) return
  started = true
  if (!isConfigured()) return

  // Give the container a moment to finish booting before opening SFTP sessions.
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const result = await query(
          `SELECT token, ftp_folder_path, ftp_manifest
           FROM proof_shares
           WHERE ftp_folder_path IS NOT NULL
             AND (expires_at IS NULL OR expires_at > NOW())
             AND GREATEST(
                   created_at,
                   COALESCE(last_viewed_at, created_at),
                   COALESCE(ftp_last_synced_at, created_at)
                 ) > NOW() - ($1 || ' days')::interval
           ORDER BY GREATEST(
                   created_at,
                   COALESCE(last_viewed_at, created_at),
                   COALESCE(ftp_last_synced_at, created_at)
                 ) DESC
           LIMIT $2`,
          [String(WARM_WINDOW_DAYS), WARM_SHARE_LIMIT]
        )
        let files = 0
        for (const row of result.rows) {
          const manifest = parseManifest(row.ftp_manifest).filter((f) => f.active !== false)
          files += manifest.length
          prefetchManifest(row.ftp_folder_path, manifest)
        }
        console.info('[proof-cache]', JSON.stringify({
          event: 'boot_warm_queued',
          shares: result.rows.length,
          files,
        }))
      } catch (err) {
        console.error('[proof-cache] boot warm failed:', err)
      }
    })()
  }, 15_000)
  timer.unref?.()
}
