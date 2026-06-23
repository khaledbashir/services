const { Pool } = require('pg')

const SPEC_SHEET_CATEGORY = 'spec_sheets'

const pool = new Pool({
  user: process.env.DB_USER || 'ancservices',
  password: process.env.DB_PASSWORD || process.env.DB_PASS || 'AncSvc2026SecureDB',
  host: process.env.DB_HOST || 'anc-services-db-standalone',
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME || 'anc_services',
})

async function main() {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const result = await client.query(
      `
      WITH source AS (
        SELECT *
        FROM print_requests
        WHERE (
          COALESCE(job_title, '') ILIKE '%spec sheet%'
          OR COALESCE(client_name, '') ILIKE '%spec sheet%'
          OR COALESCE(notes, '') ILIKE '%spec sheet%'
        )
      ),
      inserted AS (
        INSERT INTO design_requests (
          external_id, venue_id, company_name, client_name, job_title, notes, designer_id,
          status, hours_estimated, hours_spent, due_date, created_at, updated_at
        )
        SELECT
          'print-spec-sheet:' || s.id::text,
          s.venue_id,
          s.client_name,
          s.client_name,
          s.job_title,
          s.notes,
          s.assignee_id,
          'request_submitted',
          NULL,
          0,
          COALESCE(s.arrival_date, s.ship_date),
          COALESCE(s.created_at, NOW()),
          COALESCE(s.updated_at, NOW())
        FROM source s
        WHERE NOT EXISTS (
          SELECT 1
          FROM design_requests d
          WHERE d.external_id = 'print-spec-sheet:' || s.id::text
        )
        RETURNING id::text AS design_request_id, external_id
      ),
      all_designs AS (
        SELECT id::text AS design_request_id, external_id
        FROM design_requests
        WHERE external_id IN (SELECT 'print-spec-sheet:' || id::text FROM source)
          AND external_id NOT IN (SELECT external_id FROM inserted)
      ),
      designs_to_tag AS (
        SELECT design_request_id, external_id FROM inserted
        UNION ALL
        SELECT design_request_id, external_id FROM all_designs
      ),
      tagged AS (
        INSERT INTO design_request_internal_categories (design_request_id, category, notes, set_at)
        SELECT
          design_request_id,
          $1,
          'Migrated from Print Requests because Alexis identified these as internal spec-sheet work.',
          NOW()
        FROM designs_to_tag
        ON CONFLICT (design_request_id) DO UPDATE
        SET category = EXCLUDED.category,
            notes = EXCLUDED.notes,
            set_at = NOW()
        RETURNING design_request_id
      ),
      deleted AS (
        DELETE FROM print_requests
        WHERE id IN (SELECT id FROM source)
        RETURNING id
      )
      SELECT
        (SELECT COUNT(*) FROM source)::int AS matched,
        (SELECT COUNT(*) FROM inserted)::int AS inserted,
        (SELECT COUNT(*) FROM tagged)::int AS tagged,
        (SELECT COUNT(*) FROM deleted)::int AS deleted
      `,
      [SPEC_SHEET_CATEGORY],
    )

    await client.query('COMMIT')
    console.log(JSON.stringify(result.rows[0], null, 2))
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
