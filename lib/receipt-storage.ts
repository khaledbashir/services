/**
 * Receipt Storage — MinIO objects for the infra/SaaS receipt vault.
 *
 * Reuses the same MinIO bucket as the proof pipeline (`anc-proofs`) but with
 * an `infra-receipts/<YYYY-MM>/<uuid>-<filename>` prefix so the two file
 * pools stay separate without spinning up another bucket.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { randomUUID } from 'crypto'

const BUCKET = process.env.PROOF_STORAGE_BUCKET || 'anc-proofs'
const ENDPOINT = process.env.PROOF_STORAGE_ENDPOINT || 'http://anc-proofs-minio:9000'
const ACCESS_KEY = process.env.PROOF_STORAGE_ACCESS_KEY || ''
const SECRET_KEY = process.env.PROOF_STORAGE_SECRET_KEY || ''
const REGION = process.env.PROOF_STORAGE_REGION || 'us-east-1'
const SIGNED_URL_TTL_SECONDS = Number(process.env.PROOF_SIGNED_URL_TTL || 86400)

let _client: S3Client | null = null

function client(): S3Client {
  if (_client) return _client
  if (!ACCESS_KEY || !SECRET_KEY) {
    throw new Error('Receipt storage not configured: PROOF_STORAGE_ACCESS_KEY / PROOF_STORAGE_SECRET_KEY env vars missing')
  }
  _client = new S3Client({
    endpoint: ENDPOINT,
    region: REGION,
    credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
    forcePathStyle: true,
  })
  return _client
}

function safeName(filename: string): string {
  return filename.replace(/[/\\]/g, '_').replace(/[^\w.\- ]/g, '_').slice(0, 180)
}

export function buildReceiptKey(filename: string, paidAt?: string | null): string {
  const month = paidAt && /^\d{4}-\d{2}/.test(paidAt)
    ? paidAt.slice(0, 7)
    : new Date().toISOString().slice(0, 7)
  return `infra-receipts/${month}/${randomUUID()}-${safeName(filename)}`
}

export async function uploadReceipt(opts: {
  key: string
  contentType: string
  body: Buffer
}): Promise<void> {
  await client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: opts.key,
    Body: opts.body,
    ContentType: opts.contentType,
    Metadata: { 'uploaded-at': new Date().toISOString() },
  }))
}

export async function getReceiptSignedUrl(key: string, ttl = SIGNED_URL_TTL_SECONDS): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn: ttl })
}

export async function fetchReceiptBytes(key: string): Promise<Buffer> {
  const res = await client().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }))
  if (!res.Body) throw new Error(`Receipt object body missing: ${key}`)
  const chunks: Buffer[] = []
  for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk))
  }
  return Buffer.concat(chunks)
}

export async function deleteReceipt(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }))
}
