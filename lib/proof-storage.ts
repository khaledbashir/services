/**
 * Proof Storage — S3/MinIO client for design proof uploads
 *
 * Owns the file side of the design-request proof pipeline. Replaces the
 * legacy T:\ → workspace.anc.com FTP flow with a native storage layer
 * running on dedicated MinIO (S3-API compatible, self-hosted on the VPS
 * alongside the dashboard).
 *
 * Bucket: `anc-proofs`
 * Object key convention: `design-requests/<designRequestId>/<yyyy-mm-dd>-<version>-<filename>`
 *
 * Proof URLs are served through the dashboard (`/proof/[token]`) rather
 * than directly from MinIO, so auth + telemetry + approve/reject flows
 * stay in one place. We only ever hand the client a dashboard URL; the
 * underlying S3 object is reached via pre-signed URLs that expire (24h
 * default, configurable).
 */

import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomBytes } from 'crypto'

const BUCKET = process.env.PROOF_STORAGE_BUCKET || 'anc-proofs'
const ENDPOINT = process.env.PROOF_STORAGE_ENDPOINT || 'http://anc-proofs-minio:9000'
const ACCESS_KEY = process.env.PROOF_STORAGE_ACCESS_KEY || ''
const SECRET_KEY = process.env.PROOF_STORAGE_SECRET_KEY || ''
const REGION = process.env.PROOF_STORAGE_REGION || 'us-east-1'
const SIGNED_URL_TTL_SECONDS = Number(process.env.PROOF_SIGNED_URL_TTL || 86400) // 24h

let _client: S3Client | null = null

function client(): S3Client {
  if (_client) return _client
  if (!ACCESS_KEY || !SECRET_KEY) {
    throw new Error('Proof storage not configured: PROOF_STORAGE_ACCESS_KEY / PROOF_STORAGE_SECRET_KEY env vars missing')
  }
  _client = new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    forcePathStyle: true,  // MinIO requires path-style
  })
  return _client
}

export interface StoredProof {
  key: string                // S3 object key
  filename: string           // original filename from the uploader
  contentType: string
  size: number
  uploadedAt: string         // ISO timestamp
  etag: string | null
  versionMarker: string      // short random suffix for idempotent re-uploads
}

// ── Key generation ───────────────────────────────────────────────────────────

export function buildProofObjectKey(opts: {
  designRequestId: string
  filename: string
}): string {
  const date = new Date().toISOString().slice(0, 10)
  const version = randomBytes(4).toString('hex')
  // Sanitize filename — keep extension, strip path separators and odd chars
  const safeName = opts.filename
    .replace(/[/\\]/g, '_')
    .replace(/[^\w.\- ]/g, '_')
    .slice(0, 180)
  return `design-requests/${opts.designRequestId}/${date}-${version}-${safeName}`
}

// ── Upload ───────────────────────────────────────────────────────────────────

export async function uploadProof(opts: {
  designRequestId: string
  filename: string
  contentType: string
  body: Buffer | Uint8Array
}): Promise<StoredProof> {
  const key = buildProofObjectKey({ designRequestId: opts.designRequestId, filename: opts.filename })
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: opts.body,
    ContentType: opts.contentType,
    Metadata: {
      'design-request-id': opts.designRequestId,
      'original-filename': opts.filename,
      'uploaded-at': new Date().toISOString(),
    },
  })
  const res = await client().send(cmd)
  return {
    key,
    filename: opts.filename,
    contentType: opts.contentType,
    size: opts.body.byteLength,
    uploadedAt: new Date().toISOString(),
    etag: res.ETag?.replace(/"/g, '') || null,
    versionMarker: key.split('-').slice(-2, -1)[0] || '',
  }
}

// ── Download / stream ────────────────────────────────────────────────────────

export async function getSignedDownloadUrl(key: string, ttlSeconds?: number): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: key })
  return getSignedUrl(client(), cmd, { expiresIn: ttlSeconds ?? SIGNED_URL_TTL_SECONDS })
}

export async function statObject(key: string): Promise<{ exists: boolean; size?: number; contentType?: string; lastModified?: string } > {
  try {
    const res = await client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }))
    return {
      exists: true,
      size: res.ContentLength,
      contentType: res.ContentType,
      lastModified: res.LastModified?.toISOString(),
    }
  } catch (err: any) {
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return { exists: false }
    throw err
  }
}

// ── List (used to show all versions of a design request's proofs) ────────────

export async function listProofsForRequest(designRequestId: string): Promise<StoredProof[]> {
  const prefix = `design-requests/${designRequestId}/`
  const res = await client().send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }))
  const items: StoredProof[] = []
  for (const obj of res.Contents || []) {
    if (!obj.Key) continue
    const head = await client().send(new HeadObjectCommand({ Bucket: BUCKET, Key: obj.Key }))
    items.push({
      key: obj.Key,
      filename: head.Metadata?.['original-filename'] || obj.Key.split('-').pop() || obj.Key,
      contentType: head.ContentType || 'application/octet-stream',
      size: obj.Size || 0,
      uploadedAt: head.Metadata?.['uploaded-at'] || obj.LastModified?.toISOString() || '',
      etag: obj.ETag?.replace(/"/g, '') || null,
      versionMarker: obj.Key.split('-').slice(-2, -1)[0] || '',
    })
  }
  items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))  // newest first
  return items
}

// ── Delete ───────────────────────────────────────────────────────────────────

export async function deleteProof(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}

// ── Health check ─────────────────────────────────────────────────────────────

export async function isStorageReachable(): Promise<{ ok: boolean; error?: string }> {
  try {
    // ListObjects with MaxKeys=1 is the cheapest "are you alive" call
    await client().send(new ListObjectsV2Command({ Bucket: BUCKET, MaxKeys: 1 }))
    return { ok: true }
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export function isConfigured(): boolean {
  return Boolean(ACCESS_KEY && SECRET_KEY)
}
