/**
 * Proof FTP — read-only browse/stream source backed by ANC's own SFTP server.
 *
 * The third proof source, alongside Twenty attachments (`proof-share.ts`) and
 * self-hosted MinIO (`proof-storage.ts`). Where those *hold* files, this one
 * only ever *points at* a folder that already lives on ANC's production FTP
 * (ftp.anc.com) and serves whatever is inside it. Nothing is uploaded or
 * copied to our disk — the proof videos run 100–200GB and the FTP is 56TB, so
 * we stream on demand. Only short-lived directory metadata is cached.
 *
 * Why this file looks the way it does — three hard facts about that server,
 * verified live 2026-07-09:
 *   1. It is old (built ~2019, WS_FTP on Windows). It only offers legacy SSH
 *      ciphers/kex/host-keys. A modern default client is REFUSED, so we widen
 *      the algorithm set explicitly below.
 *   2. Its firewall whitelists our IPv4 (95.217.76.248) only. This box egresses
 *      IPv6 by default, which the whitelist does not cover — so we force the
 *      connection to IPv4 via a resolved-A-record host + `family: 4`.
 *   3. The root holds ~20,000 client folders, never pruned. We NEVER list the
 *      whole tree — every call lists exactly one directory level.
 *
 * Access is a dedicated read-only account. We additionally jail every path to
 * the account root so a crafted path can't walk above it.
 */

import SftpClient from 'ssh2-sftp-client'
import { Readable } from 'node:stream'
import { createHash, timingSafeEqual } from 'node:crypto'
import { lookup } from 'node:dns/promises'
import path from 'node:path'

// ── Config ───────────────────────────────────────────────────────────────────

const HOST = process.env.ANC_FTP_HOST || 'ftp.anc.com'
const PORT = Number(process.env.ANC_FTP_PORT || 22)
const USER = process.env.ANC_FTP_USER || ''
// The FTP password contains `#`, `%`, `,`, `(` etc. Env-file parsers (including
// EasyPanel's) truncate a raw value at the first `#` as an inline comment, which
// silently breaks auth. So prefer a base64-encoded password (`ANC_FTP_PASS_B64`)
// — base64's alphabet has no parser-hostile chars — and fall back to the raw var.
const PASS = process.env.ANC_FTP_PASS_B64
  ? Buffer.from(process.env.ANC_FTP_PASS_B64, 'base64').toString('utf8')
  : (process.env.ANC_FTP_PASS || '')
// The account is jailed to '/' on the server; keep configurable in case ANC
// later hands us a subtree-scoped login.
const ROOT = normalizeRemote(process.env.ANC_FTP_ROOT || '/')
const CONNECT_TIMEOUT = Number(process.env.ANC_FTP_TIMEOUT_MS || 20000)
const LIST_CACHE_TTL_MS = Math.max(5_000, Number(process.env.ANC_FTP_LIST_CACHE_TTL_MS || 60_000))
const LIST_CACHE_MAX_FOLDERS = Math.max(10, Number(process.env.ANC_FTP_LIST_CACHE_MAX_FOLDERS || 100))
const CLIENT_FOLDER_CACHE_TTL_MS = Math.max(30_000, Number(process.env.ANC_FTP_CLIENT_CACHE_TTL_MS || 300_000))
const METADATA_SESSION_IDLE_MS = Math.max(5_000, Number(process.env.ANC_FTP_METADATA_IDLE_MS || 30_000))
const FILE_STREAM_IDLE_MS = Math.max(5_000, Number(process.env.ANC_FTP_STREAM_IDLE_MS || 60_000))
const FILE_STREAM_POOL_MAX = Math.min(6, Math.max(1, Number(process.env.ANC_FTP_STREAM_POOL_MAX || 3)))
const FILE_STREAM_HIGH_WATER_MARK = Math.max(64 * 1024, Number(process.env.ANC_FTP_STREAM_HIGH_WATER_MARK || 256 * 1024))
const STREAM_POOL_WAIT_TIMEOUT_MS = Math.max(5_000, Number(process.env.ANC_FTP_STREAM_WAIT_TIMEOUT_MS || 30_000))
// Security controls. Both are opt-in by config: unset means "behave as before"
// so setting them is a deliberate tightening, not a surprise outage. Set
// ANC_FTP_ALLOWED_ROOTS (e.g. "/T,/A") and ANC_FTP_HOST_KEY_FINGERPRINT
// (`ssh-keyscan -t rsa ftp.anc.com | ssh-keygen -lf -`) in prod to enforce.
const ALLOWED_ROOTS = parseAllowedRoots(process.env.ANC_FTP_ALLOWED_ROOTS)
const PINNED_HOST_KEY = normalizeFingerprint(process.env.ANC_FTP_HOST_KEY_FINGERPRINT)
const MAX_PROOF_FILE_BYTES = Math.max(
  1024 * 1024,
  Number(process.env.ANC_FTP_MAX_PROOF_FILE_BYTES || 5 * 1024 * 1024 * 1024)
)

// Legacy algorithm set — additive to ssh2's modern defaults, not a replacement,
// so we still prefer strong crypto when the far side supports it and only fall
// back to what this 2019 box actually offers.
const LEGACY_ALGORITHMS = {
  // Only algorithms ssh2 actually implements — it hard-rejects unknown names.
  // The 2019 server offers 3des/blowfish/cast/aes-cbc; of those ssh2 supports
  // the aes-cbc family + 3des-cbc, which this box accepts (verified live).
  cipher: [
    'aes256-ctr', 'aes192-ctr', 'aes128-ctr',
    'aes256-cbc', 'aes192-cbc', 'aes128-cbc',
    '3des-cbc',
  ],
  serverHostKey: [
    'ssh-ed25519', 'ecdsa-sha2-nistp256',
    'rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa',
  ],
  kex: [
    'curve25519-sha256', 'ecdh-sha2-nistp256',
    'diffie-hellman-group14-sha256', 'diffie-hellman-group14-sha1',
    'diffie-hellman-group1-sha1', 'diffie-hellman-group-exchange-sha1',
  ],
} as const

export function isConfigured(): boolean {
  return Boolean(HOST && USER && PASS)
}

type CachedListing = { entries: FtpEntry[]; expiresAt: number }
const listingCache = new Map<string, CachedListing>()
const listingInFlight = new Map<string, Promise<FtpEntry[]>>()
const clientFolderCache = new Map<string, { value: string | null; expiresAt: number }>()
let resolvedHost: { value: string; expiresAt: number } | null = null
let metadataClient: SftpClient | null = null
let metadataConnectPromise: Promise<SftpClient> | null = null
let metadataQueue: Promise<void> = Promise.resolve()
let metadataIdleTimer: ReturnType<typeof setTimeout> | null = null

type StreamPoolEntry = {
  client: SftpClient
  busy: boolean
  idleTimer: ReturnType<typeof setTimeout> | null
}
type StreamPoolWaiter = {
  resolve: (entry: StreamPoolEntry) => void
  reject: (error: unknown) => void
}
const streamPool: StreamPoolEntry[] = []
const streamPoolWaiters: StreamPoolWaiter[] = []

function logPerf(event: string, details: Record<string, string | number | boolean | null>) {
  console.info('[proof-ftp:perf]', JSON.stringify({ event, ...details }))
}

async function resolveIpv4Host(): Promise<string> {
  if (resolvedHost && resolvedHost.expiresAt > Date.now()) return resolvedHost.value
  let host = HOST
  try {
    const { address } = await lookup(HOST, { family: 4 })
    if (address) host = address
  } catch {
    // Fall back to the hostname; `family: 4` still steers the socket.
  }
  resolvedHost = { value: host, expiresAt: Date.now() + 300_000 }
  return host
}

// ── Path safety ──────────────────────────────────────────────────────────────

/** Collapse to a POSIX absolute path with no trailing slash (except root). */
function normalizeRemote(p: string): string {
  const posix = path.posix.normalize('/' + String(p || '/').replace(/\\/g, '/'))
  return posix === '/' ? '/' : posix.replace(/\/+$/, '')
}

/**
 * Explicit allowlist of folders this account may browse, from
 * `ANC_FTP_ALLOWED_ROOTS` (comma/semicolon/newline separated). The share
 * account is read-only and jailed server-side, but the FTP also holds ~20k
 * client folders — an allowlist keeps a crafted path from wandering into
 * clients we have no business serving. The server root ('/') is never a valid
 * entry: allowing it would defeat the point.
 */
export function parseAllowedRoots(raw: string | undefined | null): string[] {
  return Array.from(
    new Set(
      String(raw ?? '')
        .split(/[,;\n]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => normalizeRemote(part))
        .filter((part) => part !== '/')
    )
  ).sort()
}

/**
 * True when `candidate` is one of the roots or lives beneath one. Compares on
 * normalized paths and on segment boundaries, so `/T/TIN-NYC` does not match
 * the root `/T/TIN`, and `..` cannot climb out.
 */
export function isPathWithinRoots(candidate: string, roots: string[]): boolean {
  if (roots.length === 0) return false
  const target = normalizeRemote(candidate)
  return roots.some((root) => {
    const normalizedRoot = normalizeRemote(root)
    if (normalizedRoot === '/') return false
    return target === normalizedRoot || target.startsWith(`${normalizedRoot}/`)
  })
}

/** Directory listings only ever expose real dirs and regular files — never symlinks. */
export function isRegularListingType(type: string | undefined | null): boolean {
  return type === 'd' || type === '-'
}

const REVIEWABLE_EXTENSIONS = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'tif', 'tiff',
  'mp4', 'mov', 'webm', 'm4v', 'mpg', 'mpeg', 'avi', 'mkv', 'wmv',
  'pdf',
])

/**
 * What a client proof is allowed to be: a plain filename (no path parts), a
 * reviewable image/video/PDF, non-empty, and under the size ceiling.
 */
export function validateProofFile(
  name: string,
  size: number,
  maxBytes: number
): { ok: true; kind: 'image' | 'video' | 'pdf' | 'other' } | { ok: false; reason: string } {
  if (!name || name !== path.posix.basename(name) || name.startsWith('.')) {
    return { ok: false, reason: 'unsafe_name' }
  }
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (!REVIEWABLE_EXTENSIONS.has(ext)) {
    return { ok: false, reason: 'unsupported_format' }
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, reason: 'empty_file' }
  }
  if (size > maxBytes) {
    return { ok: false, reason: 'too_large' }
  }
  return { ok: true, kind: classify(name) }
}

/**
 * Identity of a file revision. Same name + same bytes-and-mtime = same version;
 * a replaced file gets a new one, which is what drives manifest reconciliation.
 */
export function buildSourceVersion(name: string, size: number, modifiedAt: string): string {
  return createHash('sha1').update(`${name}|${size}|${modifiedAt}`).digest('hex')
}

// ── Host key pinning ─────────────────────────────────────────────────────────

/** Base64 SHA-256 of a host key — the same shape `ssh-keyscan` prints. */
export function fingerprintHostKey(key: Buffer): string {
  return createHash('sha256').update(key).digest('base64').replace(/=+$/, '')
}

/** Accepts `SHA256:<fp>`, a bare fingerprint, and trailing base64 padding. */
export function normalizeFingerprint(value: string | undefined | null): string {
  return String(value ?? '')
    .trim()
    .replace(/^SHA256:/i, '')
    .replace(/=+$/, '')
}

/** Constant-time compare of a presented host key against the pinned fingerprint. */
export function verifyPinnedHostKey(key: Buffer, pinned: string | undefined | null): boolean {
  const expected = normalizeFingerprint(pinned)
  if (!expected) return false
  const actual = fingerprintHostKey(key)
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

/**
 * Resolve a caller-supplied path against ROOT and refuse anything that escapes
 * it. Returns the safe absolute remote path, or throws.
 */
export function resolveSafePath(input: string): string {
  const candidate = normalizeRemote(
    input.startsWith('/') ? input : path.posix.join(ROOT, input)
  )
  const rootWithSep = ROOT === '/' ? '/' : ROOT + '/'
  if (candidate !== ROOT && !candidate.startsWith(rootWithSep)) {
    throw new Error(`Path escapes root: ${input}`)
  }
  // When an allowlist is configured, the path must also sit inside it. The
  // allowlist root itself is browsable so the picker can still start there.
  if (ALLOWED_ROOTS.length > 0 && candidate !== ROOT && !isPathWithinRoots(candidate, ALLOWED_ROOTS)) {
    throw new Error(`Path is outside the approved content library: ${input}`)
  }
  return candidate
}

// ── Connection ───────────────────────────────────────────────────────────────

/**
 * Run metadata operations through one short-idle SFTP session. Calls are
 * serialized because the legacy server is more reliable with one outstanding
 * directory command at a time. Any operation failure discards the session and
 * retries once on a fresh connection; file streams still own their sockets.
 */
async function withClient<T>(fn: (sftp: SftpClient) => Promise<T>): Promise<T> {
  if (!isConfigured()) {
    throw new Error('ANC FTP not configured: ANC_FTP_HOST / ANC_FTP_USER / ANC_FTP_PASS missing')
  }
  const run = async (): Promise<T> => {
    let lastError: unknown
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const sftp = await getMetadataClient()
      try {
        const result = await fn(sftp)
        scheduleMetadataClose()
        return result
      } catch (error) {
        lastError = error
        await closeMetadataClient()
        if (attempt === 1) {
          logPerf('metadata_retry', { attempt, reason: 'operation_failed' })
        }
      }
    }
    throw lastError
  }
  const queued = metadataQueue.then(run, run)
  metadataQueue = queued.then(() => undefined, () => undefined)
  return queued
}

/**
 * When a fingerprint is pinned, every connection must present that exact host
 * key — otherwise the session is refused. Unpinned (no env var) keeps today's
 * behavior so enforcement is a deliberate config step.
 */
function hostVerifier(): { hostVerifier?: (key: Buffer) => boolean } {
  if (!PINNED_HOST_KEY) return {}
  return {
    hostVerifier: (key: Buffer) => {
      const ok = verifyPinnedHostKey(key, PINNED_HOST_KEY)
      if (!ok) {
        console.error('[proof-ftp] host key mismatch — refusing connection', JSON.stringify({
          presented: fingerprintHostKey(key),
        }))
      }
      return ok
    },
  }
}

async function getMetadataClient(): Promise<SftpClient> {
  if (metadataClient) return metadataClient
  if (metadataConnectPromise) return metadataConnectPromise
  metadataConnectPromise = (async () => {
    const startedAt = Date.now()
    const host = await resolveIpv4Host()
    const sftp = new SftpClient()
    await sftp.connect({
      host,
      port: PORT,
      username: USER,
      password: PASS,
      readyTimeout: CONNECT_TIMEOUT,
      // @ts-expect-error ssh2 accepts `family` to pin the socket to IPv4.
      family: 4,
      algorithms: LEGACY_ALGORITHMS as any,
      ...hostVerifier(),
    })
    metadataClient = sftp
    logPerf('metadata_connect', { durationMs: Date.now() - startedAt })
    return sftp
  })()
  try {
    return await metadataConnectPromise
  } finally {
    metadataConnectPromise = null
  }
}

async function closeMetadataClient() {
  if (metadataIdleTimer) {
    clearTimeout(metadataIdleTimer)
    metadataIdleTimer = null
  }
  const client = metadataClient
  metadataClient = null
  if (client) {
    try { await client.end() } catch { /* already closed */ }
  }
}

function scheduleMetadataClose() {
  if (metadataIdleTimer) clearTimeout(metadataIdleTimer)
  metadataIdleTimer = setTimeout(() => {
    void closeMetadataClient()
  }, METADATA_SESSION_IDLE_MS)
  metadataIdleTimer.unref?.()
}

async function connectStreamClient(): Promise<StreamPoolEntry> {
  const entry: StreamPoolEntry = { client: new SftpClient(), busy: true, idleTimer: null }
  // Reserve the slot before awaiting network setup so concurrent requests
  // cannot all observe an empty pool and exceed the configured limit.
  streamPool.push(entry)
  try {
    const host = await resolveIpv4Host()
    await entry.client.connect({
      host, port: PORT, username: USER, password: PASS,
      readyTimeout: CONNECT_TIMEOUT,
      // @ts-expect-error family pins IPv4
      family: 4,
      algorithms: LEGACY_ALGORITHMS as any,
      ...hostVerifier(),
    })
    return entry
  } catch (error) {
    const index = streamPool.indexOf(entry)
    if (index >= 0) streamPool.splice(index, 1)
    try { await entry.client.end() } catch { /* connection never opened */ }
    throw error
  }
}

async function acquireStreamClient(): Promise<StreamPoolEntry> {
  const idle = streamPool.find((entry) => !entry.busy)
  if (idle) {
    idle.busy = true
    if (idle.idleTimer) clearTimeout(idle.idleTimer)
    idle.idleTimer = null
    return idle
  }
  if (streamPool.length < FILE_STREAM_POOL_MAX) return connectStreamClient()
  return new Promise<StreamPoolEntry>((resolve, reject) => {
    const waiter: StreamPoolWaiter = {
      resolve: (entry) => {
        clearTimeout(timer)
        resolve(entry)
      },
      reject: (error) => {
        clearTimeout(timer)
        reject(error)
      },
    }
    // A saturated pool must not strand requests forever — the browser retries
    // ranged video requests aggressively, and each stranded waiter is a proof
    // that "doesn't load".
    const timer = setTimeout(() => {
      const index = streamPoolWaiters.indexOf(waiter)
      if (index >= 0) streamPoolWaiters.splice(index, 1)
      const error = new Error('Timed out waiting for a file connection') as Error & { code?: string }
      error.code = 'STREAM_POOL_TIMEOUT'
      waiter.reject(error)
    }, STREAM_POOL_WAIT_TIMEOUT_MS)
    timer.unref?.()
    streamPoolWaiters.push(waiter)
  })
}

function releaseStreamClient(entry: StreamPoolEntry, reusable: boolean) {
  if (!entry.busy) return
  if (!reusable) {
    entry.busy = false
    if (entry.idleTimer) clearTimeout(entry.idleTimer)
    const index = streamPool.indexOf(entry)
    if (index >= 0) streamPool.splice(index, 1)
    void entry.client.end().catch(() => {})
    const waiter = streamPoolWaiters.shift()
    if (waiter) void acquireStreamClient().then(waiter.resolve, waiter.reject)
    return
  }

  const waiter = streamPoolWaiters.shift()
  if (waiter) {
    waiter.resolve(entry)
    return
  }

  entry.busy = false
  entry.idleTimer = setTimeout(() => {
    if (entry.busy) return
    const index = streamPool.indexOf(entry)
    if (index >= 0) streamPool.splice(index, 1)
    void entry.client.end().catch(() => {})
  }, FILE_STREAM_IDLE_MS)
  entry.idleTimer.unref?.()
}

// ── Types ────────────────────────────────────────────────────────────────────

export type FtpEntryType = 'dir' | 'file'

export interface FtpEntry {
  name: string
  path: string            // absolute remote path
  type: FtpEntryType
  size: number            // bytes (0 for dirs)
  modifiedAt: string      // ISO timestamp
  kind?: 'image' | 'video' | 'pdf' | 'other'  // files only
  sourceVersion?: string  // files only — changes when the remote file is replaced
}

/**
 * One file inside a proof share's stored manifest. `active: false` means the
 * file disappeared from the remote folder on a later sync — we keep the row
 * (approval history may reference it) but stop serving it publicly.
 */
export interface FtpManifestEntry {
  name: string
  size: number
  modifiedAt: string
  kind: 'image' | 'video' | 'pdf' | 'other'
  sourceVersion: string
  active: boolean
  previousSourceVersion?: string  // set when a sync sees a replaced revision
  removedAt?: string              // set when a sync soft-unpublishes the file
}

/**
 * Merge a fresh folder listing into a share's stored manifest. Files keep
 * their manifest identity (name) across revisions — a replaced file is
 * `updated` (new sourceVersion), a vanished file is deactivated rather than
 * dropped, and a reappearing file is reactivated.
 */
export function reconcileProofManifest(
  previous: FtpManifestEntry[],
  current: FtpManifestEntry[],
  syncedAt: string
): { manifest: FtpManifestEntry[]; added: number; updated: number; removed: number; unchanged: number } {
  const currentByName = new Map(current.map((entry) => [entry.name, entry]))
  const previousByName = new Map(previous.map((entry) => [entry.name, entry]))

  let added = 0
  let updated = 0
  let removed = 0
  let unchanged = 0

  const manifest: FtpManifestEntry[] = []
  // Keep previous ordering first (stable proof numbering), then append new files.
  for (const prev of previous) {
    const now = currentByName.get(prev.name)
    if (!now) {
      if (prev.active !== false) {
        removed += 1
        manifest.push({ ...prev, active: false, removedAt: syncedAt })
      } else {
        manifest.push(prev)
      }
      continue
    }
    if (prev.active === false) {
      // File came back after being unpublished.
      added += 1
      manifest.push({ ...now, active: true })
    } else if (prev.sourceVersion !== now.sourceVersion) {
      updated += 1
      manifest.push({ ...now, active: true, previousSourceVersion: prev.sourceVersion })
    } else {
      unchanged += 1
      manifest.push({ ...prev, active: true })
    }
  }
  for (const now of current) {
    if (previousByName.has(now.name)) continue
    added += 1
    manifest.push({ ...now, active: true })
  }
  return { manifest, added, updated, removed, unchanged }
}

export interface FtpListing {
  path: string
  parent: string | null   // null when at ROOT
  entries: FtpEntry[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
  timing: {
    source: 'cache' | 'coalesced' | 'ftp'
    durationMs: number
  }
}

// ── Classification (mirrors proof-share.classifyFile) ────────────────────────

function classify(name: string): 'image' | 'video' | 'pdf' | 'other' {
  const ext = (name.split('.').pop() || '').toLowerCase()
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'heic', 'tif', 'tiff'].includes(ext)) return 'image'
  if (['mp4', 'mov', 'webm', 'avi', 'mkv', 'm4v', 'mpg', 'mpeg', 'wmv'].includes(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}

// ── Browse (one directory level, paginated) ──────────────────────────────────

/**
 * List a single directory level. Dirs first (alphabetical), then files. Paged
 * so the 20k-entry root never ships in one response. `page` is 1-based.
 */
export async function listDir(
  remotePath: string,
  opts: { page?: number; pageSize?: number } = {}
): Promise<FtpListing> {
  const safe = resolveSafePath(remotePath || ROOT)
  const page = Math.max(1, Math.floor(opts.page || 1))
  const pageSize = Math.min(500, Math.max(1, Math.floor(opts.pageSize || 100)))

  const startedAt = Date.now()
  const { entries: allEntries, source } = await getDirectoryEntries(safe)

  // With an allowlist configured, the root listing shows only approved folders
  // — the picker never even offers the server's admin/system directories.
  const all = ALLOWED_ROOTS.length > 0 && safe === ROOT
    ? allEntries.filter((entry) => isPathWithinRoots(entry.path, ALLOWED_ROOTS))
    : allEntries

  const total = all.length
  const start = (page - 1) * pageSize
  const entries = all.slice(start, start + pageSize)

  return {
    path: safe,
    parent: safe === ROOT ? null : normalizeRemote(path.posix.dirname(safe)),
    entries,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
    timing: { source, durationMs: Date.now() - startedAt },
  }
}

async function getDirectoryEntries(
  safe: string
): Promise<{ entries: FtpEntry[]; source: 'cache' | 'coalesced' | 'ftp' }> {
  const cached = listingCache.get(safe)
  if (cached && cached.expiresAt > Date.now()) {
    // Refresh insertion order so the capped map behaves like an LRU cache.
    listingCache.delete(safe)
    listingCache.set(safe, cached)
    return { entries: cached.entries, source: 'cache' }
  }
  if (cached) listingCache.delete(safe)

  const pending = listingInFlight.get(safe)
  if (pending) return { entries: await pending, source: 'coalesced' }

  const startedAt = Date.now()
  const load = withClient(async (sftp) => {
    const raw = await sftp.list(safe)
    const entries = raw
      // Hidden/system entries (WS_FTP writes .etc, WS_FTP_LOGS, etc.) stay out,
      // and so do symlinks/sockets — only real dirs and regular files.
      .filter((e) => !e.name.startsWith('.') && isRegularListingType(e.type as string))
      .map<FtpEntry>((e) => {
        const isDir = e.type === 'd'
        const full = normalizeRemote(path.posix.join(safe, e.name))
        return {
          name: e.name,
          path: full,
          type: isDir ? 'dir' : 'file',
          size: isDir ? 0 : (e.size || 0),
          modifiedAt: new Date((e.modifyTime as number) || Date.now()).toISOString(),
          ...(isDir
            ? {}
            : {
                kind: classify(e.name),
                sourceVersion: `${e.size || 0}-${(e.modifyTime as number) || 0}`,
              }),
        }
      })
    // Dirs before files; each group alphabetical, case-insensitive.
    entries.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return entries
  })
  listingInFlight.set(safe, load)
  try {
    const entries = await load
    listingCache.set(safe, { entries, expiresAt: Date.now() + LIST_CACHE_TTL_MS })
    while (listingCache.size > LIST_CACHE_MAX_FOLDERS) {
      const oldest = listingCache.keys().next().value as string | undefined
      if (!oldest) break
      listingCache.delete(oldest)
    }
    logPerf('list_directory', {
      source: 'ftp',
      durationMs: Date.now() - startedAt,
      entryCount: entries.length,
      pathDepth: safe === '/' ? 0 : safe.split('/').filter(Boolean).length,
    })
    return { entries, source: 'ftp' }
  } finally {
    listingInFlight.delete(safe)
  }
}

/** All reviewable files directly inside a folder (the proofs a client swipes). */
export async function listProofFiles(remotePath: string): Promise<FtpEntry[]> {
  const safe = resolveSafePath(remotePath || ROOT)
  const startedAt = Date.now()
  const { entries, source } = await getDirectoryEntries(safe)
  // A proof is a reviewable image/video/PDF. Working files (.psd, .zip,
  // thumbs.db) that happen to sit in the folder never reach a client.
  let rejected = 0
  const files = entries.filter((entry) => {
    if (entry.type !== 'file') return false
    const verdict = validateProofFile(entry.name, entry.size, MAX_PROOF_FILE_BYTES)
    if (!verdict.ok) {
      rejected += 1
      return false
    }
    return true
  })
  logPerf('list_proof_files', {
    source,
    durationMs: Date.now() - startedAt,
    entryCount: entries.length,
    fileCount: files.length,
    rejected,
    pathDepth: safe === '/' ? 0 : safe.split('/').filter(Boolean).length,
  })
  return files
}

// ── Tri-code → client folder ─────────────────────────────────────────────────

/**
 * Derive a client's top-level FTP folder from their tri-code and confirm it
 * exists, so a ticket can open the browser already parked at the right client.
 *
 * The FTP files by first-letter → 3-letter code, e.g. tri-code `TIN` lives at
 * `/T/TIN`. We only resolve the client root (not the specific proof folder —
 * that's deeper and non-derivable), and we verify it's really there so the UI
 * can fall back to a plain root browse when a client isn't filed by this rule.
 * Returns the absolute folder path, or null if it can't be resolved/confirmed.
 */
export async function resolveClientFolder(triCode: string): Promise<string | null> {
  if (!isConfigured()) return null
  const code = String(triCode || '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
  if (!code) return null
  const cached = clientFolderCache.get(code)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  const firstLetter = code[0]
  const candidate = normalizeRemote(`/${firstLetter}/${code}`)
  try {
    const safe = resolveSafePath(candidate)
    const value = await withClient(async (sftp) => {
      const s = await sftp.stat(safe).catch(() => null)
      return s && s.isDirectory ? safe : null
    })
    clientFolderCache.set(code, { value, expiresAt: Date.now() + CLIENT_FOLDER_CACHE_TTL_MS })
    return value
  } catch {
    clientFolderCache.set(code, { value: null, expiresAt: Date.now() + 60_000 })
    return null
  }
}

// ── Stat + stream (for the file proxy) ───────────────────────────────────────

export async function statFile(
  remotePath: string
): Promise<{ exists: boolean; size?: number; kind?: string; name?: string }> {
  const safe = resolveSafePath(remotePath)
  return withClient(async (sftp) => {
    try {
      const s = await sftp.stat(safe)
      if (s.isDirectory) return { exists: false } // not a file
      return { exists: true, size: s.size, kind: classify(safe), name: path.posix.basename(safe) }
    } catch {
      return { exists: false }
    }
  })
}

/**
 * Open a readable stream for a file, optionally a byte range (for HTTP Range /
 * video scrubbing on the big review MP4s). The returned stream leases a pooled
 * connection and returns it on end. Failed streams discard their connection.
 */
export async function openFileStream(
  remotePath: string,
  range?: { start: number; end?: number }
): Promise<{
  stream: Readable
  size: number
  name: string
  kind: string
  modifiedAt: string
  range?: { start: number; end: number }
}> {
  if (!isConfigured()) throw new Error('ANC FTP not configured')
  const safe = resolveSafePath(remotePath)

  const startedAt = Date.now()
  let lease: StreamPoolEntry | null = null
  let s: Awaited<ReturnType<SftpClient['stat']>> | null = null
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    lease = await acquireStreamClient()
    try {
      s = await lease.client.stat(safe)
      break
    } catch (error) {
      lastError = error
      releaseStreamClient(lease, false)
      lease = null
    }
  }
  if (!lease || !s) throw lastError
  const sftp = lease.client
  if (s.isDirectory) {
    releaseStreamClient(lease, true)
    throw new Error('Path is a directory, not a file')
  }

  const readOpts: Record<string, number> = {}
  let resolvedRange: { start: number; end: number } | undefined
  if (range) {
    const start = Math.floor(range.start)
    const end = Math.min(Math.floor(range.end ?? s.size - 1), s.size - 1)
    if (!Number.isFinite(start) || start < 0 || start >= s.size || end < start) {
      releaseStreamClient(lease, true)
      const error = new Error('Requested byte range is not satisfiable') as Error & { code?: string }
      error.code = 'RANGE_NOT_SATISFIABLE'
      throw error
    }
    resolvedRange = { start, end }
    readOpts.start = start
    readOpts.end = end
  }
  readOpts.highWaterMark = FILE_STREAM_HIGH_WATER_MARK

  // createReadStream on the underlying ssh2 sftp stream.
  const stream = sftp.createReadStream(safe, readOpts as any) as unknown as Readable
  let released = false
  const release = (reusable: boolean) => {
    if (released) return
    released = true
    releaseStreamClient(lease!, reusable)
  }
  stream.once('end', () => release(true))
  stream.once('close', () => release(false))
  stream.once('error', () => release(false))

  logPerf('open_file', {
    durationMs: Date.now() - startedAt,
    size: s.size,
    ranged: Boolean(resolvedRange),
    pathDepth: safe.split('/').filter(Boolean).length,
  })
  return {
    stream,
    size: s.size,
    name: path.posix.basename(safe),
    kind: classify(safe),
    modifiedAt: new Date((s.modifyTime as number) || Date.now()).toISOString(),
    range: resolvedRange,
  }
}

/**
 * Download a whole remote file to a local path using SFTP fastGet — many
 * concurrent 32KB reads on one connection. The legacy line yields ~110KB/s to
 * a sequential stream; parallel in-flight reads pull the same file an order
 * of magnitude faster, which is what makes cache warming practical.
 */
export async function downloadFileFast(remotePath: string, localPath: string): Promise<void> {
  if (!isConfigured()) throw new Error('ANC FTP not configured')
  const safe = resolveSafePath(remotePath)
  const startedAt = Date.now()
  let lease: StreamPoolEntry | null = null
  let lastError: unknown
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    lease = await acquireStreamClient()
    try {
      await lease.client.fastGet(safe, localPath, {
        concurrency: 64,
        chunkSize: 32_768,
      })
      releaseStreamClient(lease, true)
      logPerf('fast_download', {
        durationMs: Date.now() - startedAt,
        pathDepth: safe.split('/').filter(Boolean).length,
      })
      return
    } catch (error) {
      lastError = error
      releaseStreamClient(lease, false)
      lease = null
    }
  }
  throw lastError
}

// ── Health check ─────────────────────────────────────────────────────────────

export async function isReachable(): Promise<{ ok: boolean; error?: string; rootEntries?: number }> {
  if (!isConfigured()) return { ok: false, error: 'not configured' }
  try {
    const listing = await listDir(ROOT, { pageSize: 1 })
    return { ok: true, rootEntries: listing.total }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}
