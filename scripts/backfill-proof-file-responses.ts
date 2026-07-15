import { Client } from 'pg'

/**
 * Backfill per-file proof responses for shares the client approved (or requested
 * changes on) as a WHOLE proof before 2026-07-15. Those one-click decisions set
 * proof_shares.client_response but never wrote file_responses, so the staff
 * roster showed every file as "awaiting" even though the proof was signed off
 * (Charlie 2026-07-15). This stamps the same decision onto each active manifest
 * file so the roster reflects reality. Idempotent: only rows with an empty
 * file_responses map are touched.
 */

const client = new Client({
  host: process.env.DB_HOST || 'anc-services-db-standalone',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'AncSvc2026SecureDB',
  database: process.env.DB_NAME || 'anc_services',
})

function fileIdFor(name: string): string {
  return `ftp-${Buffer.from(name).toString('base64url')}`
}

async function main() {
  await client.connect()
  try {
    const { rows } = await client.query(
      `SELECT token, client_response, client_response_at, ftp_manifest
         FROM proof_shares
        WHERE client_response IN ('approved','changes_requested')
          AND ftp_manifest IS NOT NULL
          AND jsonb_array_length(ftp_manifest) > 0
          AND (file_responses IS NULL OR file_responses = '{}'::jsonb)`
    )

    let patched = 0
    for (const row of rows) {
      const manifest: any[] = Array.isArray(row.ftp_manifest) ? row.ftp_manifest : []
      const active = manifest.filter((f) => f && f.active !== false && typeof f.name === 'string')
      if (active.length === 0) continue
      const at = row.client_response_at ? new Date(row.client_response_at).toISOString() : new Date().toISOString()
      const fileResponses: Record<string, unknown> = {}
      for (const f of active) {
        fileResponses[fileIdFor(f.name)] = { response: row.client_response, note: null, name: f.name, at }
      }
      await client.query(`UPDATE proof_shares SET file_responses = $2::jsonb WHERE token = $1`, [
        row.token,
        JSON.stringify(fileResponses),
      ])
      patched++
      console.log(`  backfilled ${active.length} files → ${row.client_response} (${row.token.slice(0, 10)}…)`)
    }
    console.log(`Done. ${patched} of ${rows.length} candidate share(s) backfilled.`)
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err)
  process.exit(1)
})
