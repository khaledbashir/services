import crypto from 'node:crypto'
import { query } from '../lib/db'
import { patchTwentyRecord, fetchAttachmentsForRecord } from '../lib/proof-share'

const TWENTY_BASE = 'https://abc-twenty.izcgmb.easypanel.host'
const TWENTY_API_KEY = process.env.TWENTY_API_KEY!

function generateToken(length = 24): string {
  return crypto.randomBytes(length).toString('base64url')
}

function buildPublicUrl(token: string): string {
  const base = 'https://abc-anc-services.izcgmb.easypanel.host'
  return `${base}/proof/${token}`
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let lastReqAt = 0
async function twentyPatch(objectType: string, recordId: string, patch: Record<string, unknown>): Promise<boolean> {
  const now = Date.now()
  const wait = Math.max(0, 800 - (now - lastReqAt))
  if (wait) await sleep(wait)
  lastReqAt = Date.now()

  const plural = objectType === 'designRequest' ? 'designRequests' : objectType + 's'
  try {
    const res = await fetch(`${TWENTY_BASE}/rest/${plural}/${recordId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${TWENTY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.error(`  Twenty PATCH ${res.status}: ${body.slice(0, 200)}`)
      if (res.status === 429) {
        console.error('  Rate limited, backing off 65s...')
        await sleep(65000)
        return twentyPatch(objectType, recordId, patch)
      }
      return false
    }
    return true
  } catch (err) {
    console.error(`  Twenty PATCH error:`, err)
    return false
  }
}

async function main() {
  const records: any[] = require('../records.json')
  const target = records.filter(r => !r.proofShareUrl).slice(0, 100)
  console.log(`Records to process: ${target.length}`)

  let processed = 0
  let skipped = 0

  for (let i = 0; i < target.length; i++) {
    const r = target[i]
    const twentyRecordId = r.id
    const twentyObjectType = 'designRequest'

    try {
      const token = generateToken()
      const publicUrl = buildPublicUrl(token)

      await query(
        `UPDATE proof_shares
         SET expires_at = NOW()
         WHERE twenty_object_type = $1
           AND twenty_record_id = $2
           AND (expires_at IS NULL OR expires_at > NOW())`,
        [twentyObjectType, twentyRecordId]
      )

      await query(
        `INSERT INTO proof_shares (
          token, twenty_object_type, twenty_record_id, expires_at,
          message, created_by_name, created_by_email, client_email
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [token, twentyObjectType, twentyRecordId, null, null, null, null, null]
      )

      const ok = await twentyPatch(twentyObjectType, twentyRecordId, {
        proofShareUrl: publicUrl,
        proofSentAt: new Date().toISOString(),
        proofViewCount: 0,
        proofLastViewedAt: null,
        proofRespondedAt: null,
      })

      if (ok) {
        processed++
        console.log(`[${i + 1}/${target.length}] ${r.name} -> ${publicUrl}`)
      } else {
        skipped++
        console.error(`[${i + 1}/${target.length}] FAILED Twenty update: ${r.id}`)
      }
    } catch (err: any) {
      skipped++
      console.error(`[${i + 1}/${target.length}] Error ${r.id}: ${err.message}`)
    }
  }

  console.log(`\nDone. Processed: ${processed}, Skipped: ${skipped}`)
  process.exit(0)
}

main()
