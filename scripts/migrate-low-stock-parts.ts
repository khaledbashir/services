/**
 * Extend low-stock alerting to the parts catalog — Joe 2026-08-17 follow-through.
 *
 * "We need to figure out how to get inventory lists in the Dashboard that can
 *  be updated and prompt us when we start to run low."
 *
 * ANC keeps stock in two shapes and both are "inventory lists in the Dashboard":
 *
 *   - `inventory`  — what sits at a named VENUE (venue_id + threshold_low).
 *                    This is what RMA repairs are credited back into.
 *   - `parts`      — the central parts catalog (quantity_on_hand +
 *                    reorder_threshold), not tied to a building.
 *
 * The first sweep only watched the venue shelf, so a parts-catalog line could
 * run to zero in silence. Rather than merge two models that mean different
 * things, the alert row is widened to point at either one.
 *
 * `inventory_id` becomes nullable and `part_id` joins it, with a constraint
 * that exactly one is set — so an alert can never be about nothing, and never
 * about two things at once.
 */
import { query } from '../lib/db'

async function main() {
  await query(`ALTER TABLE inventory_low_stock_alerts ALTER COLUMN inventory_id DROP NOT NULL`)

  await query(`
    ALTER TABLE inventory_low_stock_alerts
      ADD COLUMN IF NOT EXISTS part_id uuid REFERENCES parts(id) ON DELETE CASCADE
  `)

  await query(`
    ALTER TABLE inventory_low_stock_alerts
      DROP CONSTRAINT IF EXISTS low_stock_alert_targets_exactly_one
  `)
  await query(`
    ALTER TABLE inventory_low_stock_alerts
      ADD CONSTRAINT low_stock_alert_targets_exactly_one
      CHECK (num_nonnulls(inventory_id, part_id) = 1)
  `)

  // One open alert per part, mirroring the existing rule for venue stock: an
  // item that is still low tomorrow must not generate a second alert.
  await query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_low_stock_open_per_part
      ON inventory_low_stock_alerts(part_id) WHERE cleared_at IS NULL AND part_id IS NOT NULL
  `)

  const summary = await query(`
    SELECT
      (SELECT count(*) FROM inventory
        WHERE COALESCE(quantity,0) <= COALESCE(threshold_low,5))::int AS venue_stock_low,
      (SELECT count(*) FROM parts
        WHERE COALESCE(quantity_on_hand,0) <= COALESCE(reorder_threshold,5))::int AS parts_low,
      (SELECT count(*) FROM inventory_low_stock_alerts WHERE cleared_at IS NULL)::int AS open_alerts
  `)

  console.log('Low-stock alerting now covers venue stock and the parts catalog')
  console.table(summary.rows)
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
