import { query } from '../lib/db'

async function main() {
  await query(`
    ALTER TABLE venues
      ADD COLUMN IF NOT EXISTS content_guide text;
  `)
  console.log('Migration complete: venues.content_guide')
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
