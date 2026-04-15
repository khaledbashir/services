import { pool, query } from './lib/db'

async function check() {
  pool.options.host = 'localhost'
  try {
    const res = await query('SELECT count(*) FROM proof_shares')
    console.log('Count:', res.rows[0].count)
  } catch (err) {
    console.error(err)
  }
  process.exit(0)
}
check()
