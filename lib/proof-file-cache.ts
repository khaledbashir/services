/**
 * Local disk cache for FTP-backed proof files.
 *
 * Why: the legacy file server is slow to first byte (old handshake, single
 * slow link) — the old in-house proof site felt fast because it served files
 * from a disk sitting next to them. We can't move the files, but we can keep
 * hot copies here: the first read of a proof streams from the source while a
 * background copy lands on our disk; every read after that is local. Shares
 * also prefetch their whole folder at creation/sync time, so by the time a
 * client opens the link the files are usually already local.
 *
 * Cache entries are keyed by remote path + sourceVersion (size+mtime), so a
 * revised file (same name, new content) naturally misses the old entry and
 * caches the new revision. Eviction is LRU by access time under a total cap.
 */

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { pipeline } from 'node:stream/promises'
import { openFileStream, type FtpManifestEntry } from '@/lib/proof-ftp'

const CACHE_DIR = process.env.PROOF_FILE_CACHE_DIR || '/tmp/anc-proof-cache'
const MAX_TOTAL_BYTES = Math.max(
  512 * 1024 * 1024,
  Number(process.env.PROOF_FILE_CACHE_MAX_BYTES || 20 * 1024 * 1024 * 1024)
)
const MAX_FILE_BYTES = Math.max(
  16 * 1024 * 1024,
  Number(process.env.PROOF_FILE_CACHE_MAX_FILE_BYTES || 3 * 1024 * 1024 * 1024)
)

function keyFor(remotePath: string, sourceVersion: string): string {
  return createHash('sha1').update(`${remotePath}|${sourceVersion}`).digest('hex')
}

function binPath(key: string): string {
  return path.join(CACHE_DIR, `${key}.bin`)
}

async function ensureDir(): Promise<void> {
  await fsp.mkdir(CACHE_DIR, { recursive: true })
}

/**
 * Returns the local copy of a remote file revision, or null on a miss.
 * A hit bumps the entry's access time so eviction treats it as fresh.
 */
export async function getCachedFile(
  remotePath: string,
  sourceVersion: string
): Promise<{ localPath: string; size: number } | null> {
  try {
    const p = binPath(keyFor(remotePath, sourceVersion))
    const st = await fsp.stat(p)
    void fsp.utimes(p, new Date(), st.mtime).catch(() => {})
    return { localPath: p, size: st.size }
  } catch {
    return null
  }
}

export function openCachedStream(
  localPath: string,
  range?: { start: number; end: number }
) {
  return createReadStream(localPath, range ? { start: range.start, end: range.end } : undefined)
}

// One download at a time — prefetching a 12-video folder must not starve the
// small live-stream connection pool that real viewers are using.
const inFlight = new Map<string, Promise<void>>()
let downloadQueue: Promise<void> = Promise.resolve()

/**
 * Fire-and-forget: pull a full copy of a remote file revision into the cache.
 * Deduped per revision; oversized files are skipped (they stream live only).
 */
export function prefetchFile(remotePath: string, sourceVersion: string, size: number): Promise<void> {
  const key = keyFor(remotePath, sourceVersion)
  const existing = inFlight.get(key)
  if (existing) return existing
  if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES || size > MAX_TOTAL_BYTES) {
    return Promise.resolve()
  }

  const run = downloadQueue.then(async () => {
    const dest = binPath(key)
    try {
      await fsp.access(dest)
      return // already cached
    } catch { /* miss — download */ }
    const startedAt = Date.now()
    await ensureDir()
    const temp = `${dest}.part-${process.pid}-${startedAt}`
    try {
      const opened = await openFileStream(remotePath)
      await pipeline(opened.stream, createWriteStream(temp))
      await fsp.rename(temp, dest)
      console.info('[proof-cache]', JSON.stringify({
        event: 'cached',
        size,
        durationMs: Date.now() - startedAt,
        name: path.posix.basename(remotePath),
      }))
      await evictIfNeeded()
    } catch (err) {
      await fsp.rm(temp, { force: true }).catch(() => {})
      console.error('[proof-cache] prefetch failed:', remotePath, err)
    }
  })
  downloadQueue = run.then(() => undefined, () => undefined)
  inFlight.set(key, run)
  void run.finally(() => inFlight.delete(key))
  return run
}

/** Warm the cache for every active file in a share's manifest. */
export function prefetchManifest(folderPath: string, entries: FtpManifestEntry[]): void {
  for (const entry of entries) {
    if (entry.active === false) continue
    const remotePath = path.posix.join(folderPath, entry.name)
    void prefetchFile(
      remotePath,
      entry.sourceVersion || `${entry.size}-${entry.modifiedAt}`,
      entry.size
    )
  }
}

async function evictIfNeeded(): Promise<void> {
  try {
    const names = await fsp.readdir(CACHE_DIR)
    const files: Array<{ p: string; size: number; atimeMs: number }> = []
    let total = 0
    for (const name of names) {
      if (!name.endsWith('.bin')) {
        // Stale .part files from crashed downloads: clean anything > 1h old.
        if (name.includes('.part-')) {
          const p = path.join(CACHE_DIR, name)
          const st = await fsp.stat(p).catch(() => null)
          if (st && Date.now() - st.mtimeMs > 3_600_000) await fsp.rm(p, { force: true }).catch(() => {})
        }
        continue
      }
      const p = path.join(CACHE_DIR, name)
      const st = await fsp.stat(p).catch(() => null)
      if (!st) continue
      total += st.size
      files.push({ p, size: st.size, atimeMs: st.atimeMs })
    }
    if (total <= MAX_TOTAL_BYTES) return
    files.sort((a, b) => a.atimeMs - b.atimeMs)
    for (const file of files) {
      if (total <= MAX_TOTAL_BYTES) break
      await fsp.rm(file.p, { force: true }).catch(() => {})
      total -= file.size
      console.info('[proof-cache]', JSON.stringify({ event: 'evicted', size: file.size }))
    }
  } catch (err) {
    console.error('[proof-cache] eviction failed:', err)
  }
}
