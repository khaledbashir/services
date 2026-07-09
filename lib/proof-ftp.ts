/**
 * Proof FTP — read-only browse/stream source backed by ANC's own SFTP server.
 *
 * The third proof source, alongside Twenty attachments (`proof-share.ts`) and
 * self-hosted MinIO (`proof-storage.ts`). Where those *hold* files, this one
 * only ever *points at* a folder that already lives on ANC's production FTP
 * (ftp.anc.com) and serves whatever is inside it. Nothing is uploaded or
 * copied to our disk — the proof videos run 100–200GB and the FTP is 56TB, so
 * we stream on demand and keep zero local state.
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

// ── Path safety ──────────────────────────────────────────────────────────────

/** Collapse to a POSIX absolute path with no trailing slash (except root). */
function normalizeRemote(p: string): string {
  const posix = path.posix.normalize('/' + String(p || '/').replace(/\\/g, '/'))
  return posix === '/' ? '/' : posix.replace(/\/+$/, '')
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
  return candidate
}

// ── Connection ───────────────────────────────────────────────────────────────

/**
 * Open a short-lived SFTP connection, run `fn`, and always disconnect. We do NOT
 * pool: browse/stream calls are infrequent and a stale pooled socket against a
 * flaky legacy server is worse than a fresh ~200ms connect each time.
 */
async function withClient<T>(fn: (sftp: SftpClient) => Promise<T>): Promise<T> {
  if (!isConfigured()) {
    throw new Error('ANC FTP not configured: ANC_FTP_HOST / ANC_FTP_USER / ANC_FTP_PASS missing')
  }
  // Force IPv4 by resolving the A record ourselves — passing the literal IPv4
  // guarantees egress on the whitelisted 95.217.76.248 path.
  let host = HOST
  try {
    const { address } = await lookup(HOST, { family: 4 })
    if (address) host = address
  } catch {
    // Fall back to the hostname; `family: 4` below still steers the socket.
  }

  const sftp = new SftpClient()
  try {
    await sftp.connect({
      host,
      port: PORT,
      username: USER,
      password: PASS,
      readyTimeout: CONNECT_TIMEOUT,
      // @ts-expect-error ssh2 accepts `family` to pin the socket to IPv4.
      family: 4,
      algorithms: LEGACY_ALGORITHMS as any,
    })
    return await fn(sftp)
  } finally {
    try { await sftp.end() } catch { /* already closed */ }
  }
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
}

export interface FtpListing {
  path: string
  parent: string | null   // null when at ROOT
  entries: FtpEntry[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
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

  const all = await withClient(async (sftp) => {
    const raw = await sftp.list(safe)
    return raw
      // Hidden/system entries (WS_FTP writes .etc, WS_FTP_LOGS, etc.) stay out.
      .filter((e) => !e.name.startsWith('.'))
      .map<FtpEntry>((e) => {
        const isDir = e.type === 'd'
        const full = normalizeRemote(path.posix.join(safe, e.name))
        return {
          name: e.name,
          path: full,
          type: isDir ? 'dir' : 'file',
          size: isDir ? 0 : (e.size || 0),
          modifiedAt: new Date((e.modifyTime as number) || Date.now()).toISOString(),
          ...(isDir ? {} : { kind: classify(e.name) }),
        }
      })
  })

  // Dirs before files; each group alphabetical, case-insensitive.
  all.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  })

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
  }
}

/** All reviewable files directly inside a folder (the proofs a client swipes). */
export async function listProofFiles(remotePath: string): Promise<FtpEntry[]> {
  const listing = await listDir(remotePath, { pageSize: 500 })
  let entries = listing.entries.filter((e) => e.type === 'file')
  // Drain remaining pages for folders with >500 files (rare, but correct).
  let page = 2
  let more = listing.hasMore
  while (more) {
    const next = await listDir(remotePath, { page, pageSize: 500 })
    entries = entries.concat(next.entries.filter((e) => e.type === 'file'))
    more = next.hasMore
    page += 1
  }
  return entries
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
  const firstLetter = code[0]
  const candidate = normalizeRemote(`/${firstLetter}/${code}`)
  try {
    const safe = resolveSafePath(candidate)
    return await withClient(async (sftp) => {
      const s = await sftp.stat(safe).catch(() => null)
      return s && s.isDirectory ? safe : null
    })
  } catch {
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
 * video scrubbing on the big review MP4s). The returned stream owns its own
 * connection and closes it on end/error — do NOT wrap in withClient.
 */
export async function openFileStream(
  remotePath: string,
  range?: { start: number; end?: number }
): Promise<{ stream: Readable; size: number; name: string; kind: string }> {
  if (!isConfigured()) throw new Error('ANC FTP not configured')
  const safe = resolveSafePath(remotePath)

  let host = HOST
  try {
    const { address } = await lookup(HOST, { family: 4 })
    if (address) host = address
  } catch { /* keep hostname */ }

  const sftp = new SftpClient()
  await sftp.connect({
    host, port: PORT, username: USER, password: PASS,
    readyTimeout: CONNECT_TIMEOUT,
    // @ts-expect-error family pins IPv4
    family: 4,
    algorithms: LEGACY_ALGORITHMS as any,
  })

  const s = await sftp.stat(safe).catch((err) => {
    void sftp.end()
    throw err
  })
  if (s.isDirectory) {
    await sftp.end()
    throw new Error('Path is a directory, not a file')
  }

  const readOpts: Record<string, number> = {}
  if (range) {
    readOpts.start = range.start
    if (typeof range.end === 'number') readOpts.end = range.end
  }

  // createReadStream on the underlying ssh2 sftp stream.
  const stream = sftp.createReadStream(safe, readOpts as any) as unknown as Readable
  const cleanup = () => { sftp.end().catch(() => {}) }
  stream.once('end', cleanup)
  stream.once('close', cleanup)
  stream.once('error', cleanup)

  return { stream, size: s.size, name: path.posix.basename(safe), kind: classify(safe) }
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
