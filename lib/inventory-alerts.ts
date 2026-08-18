/**
 * Low-stock alerting and the RMA → stock return — Joe 2026-08-17.
 *
 * "We need to figure out how to get inventory lists in the Dashboard that can
 *  be updated and prompt us when we start to run low. Can these be connected
 *  to RMA tracking?"
 *
 * Two halves:
 *
 *   1. A daily sweep that reports items at or below their own threshold. It
 *      alerts on the CROSSING, not on the state — an item that is still low
 *      tomorrow does not generate a second alert, and the alert clears when
 *      stock is replenished so the next dip warns again. Without that, the
 *      daily mail becomes the same list forever and stops being read, which is
 *      exactly how the old escalation pings died.
 *
 *   2. A repaired part coming back from an RMA crediting the venue's stock,
 *      stamped on the RMA so it can only ever count once.
 */
import { query, getClient } from '@/lib/db'
import { sendEmail } from '@/lib/email'
import { brandedEmail } from '@/lib/email-templates'
import { getRecipients } from '@/lib/ticket-digests'
import { notifyOps } from '@/lib/slack'

export interface LowStockRow {
  id: string
  item_name: string
  sku: string | null
  part_number: string | null
  quantity: number
  threshold_low: number
  venue_id: string
  venue_name: string
  slack_channel_id: string | null
}

/** A parts-catalog line running low. Central stock, so no venue. */
export interface LowStockPartRow {
  id: string
  part_name: string
  part_number: string | null
  manufacturer: string | null
  quantity: number
  threshold_low: number
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/**
 * Recipients for the low-stock report. Same resolution shape as the walk-thru
 * summary — the ticket list by default, overridable in app_settings without a
 * deploy.
 */
export async function getLowStockRecipients(): Promise<string[]> {
  const override = await query(
    `SELECT value FROM app_settings WHERE key = 'inventory_low_stock_recipients'`,
  )
  if (override.rows[0]) {
    const stored = String(override.rows[0].value ?? '')
    if (stored.trim() === '') return []
    const parsed = stored.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => s.includes('@'))
    if (parsed.length > 0) return parsed
  }
  return getRecipients('open-review')
}

/**
 * Venue stock now at or below its threshold with no open alert yet.
 *
 * A row whose venue has been deleted would vanish from an inner join, so the
 * venue is joined LEFT and reported as unassigned rather than silently dropped.
 */
export async function findNewlyLowItems(): Promise<LowStockRow[]> {
  const result = await query(
    `SELECT i.id, i.item_name, i.sku, i.part_number, COALESCE(i.quantity, 0) AS quantity,
            COALESCE(i.threshold_low, 5) AS threshold_low,
            i.venue_id, COALESCE(v.name, 'Unassigned') AS venue_name, v.slack_channel_id
     FROM inventory i
     LEFT JOIN venues v ON v.id = i.venue_id
     WHERE COALESCE(i.quantity, 0) <= COALESCE(i.threshold_low, 5)
       AND NOT EXISTS (
         SELECT 1 FROM inventory_low_stock_alerts a
         WHERE a.inventory_id = i.id AND a.cleared_at IS NULL
       )
     ORDER BY COALESCE(v.name, 'Unassigned'), i.item_name`,
  )
  return result.rows
}

/**
 * Parts-catalog lines now at or below their reorder threshold with no open
 * alert yet. The catalog is not tied to a building, so these carry no venue and
 * are reported under one heading rather than pinged into a venue channel.
 */
export async function findNewlyLowParts(): Promise<LowStockPartRow[]> {
  const result = await query(
    `SELECT p.id, p.part_name, p.part_number, p.manufacturer,
            COALESCE(p.quantity_on_hand, 0) AS quantity,
            COALESCE(p.reorder_threshold, 5) AS threshold_low
     FROM parts p
     WHERE COALESCE(p.quantity_on_hand, 0) <= COALESCE(p.reorder_threshold, 5)
       AND NOT EXISTS (
         SELECT 1 FROM inventory_low_stock_alerts a
         WHERE a.part_id = p.id AND a.cleared_at IS NULL
       )
     ORDER BY p.part_name`,
  )
  return result.rows
}

/** Close alerts for anything, on either shelf, that has climbed back above its threshold. */
export async function clearRecoveredAlerts(): Promise<number> {
  const venueStock = await query(
    `UPDATE inventory_low_stock_alerts a
     SET cleared_at = NOW()
     FROM inventory i
     WHERE a.inventory_id = i.id
       AND a.cleared_at IS NULL
       AND COALESCE(i.quantity, 0) > COALESCE(i.threshold_low, 5)`,
  )
  const catalog = await query(
    `UPDATE inventory_low_stock_alerts a
     SET cleared_at = NOW()
     FROM parts p
     WHERE a.part_id = p.id
       AND a.cleared_at IS NULL
       AND COALESCE(p.quantity_on_hand, 0) > COALESCE(p.reorder_threshold, 5)`,
  )
  return (venueStock.rowCount || 0) + (catalog.rowCount || 0)
}

export interface LowStockRunResult {
  newly_low: number
  /** Of `newly_low`, how many came from the venue shelf vs the parts catalog. */
  newly_low_venue_stock: number
  newly_low_parts: number
  cleared: number
  emailed: boolean
  recipients: string[]
  slack_venue_pings: number
}

function stockRow(name: string, sub: string | null, where: string, qty: number, level: number): string {
  return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${escapeHtml(name)}${sub ? ` <span style="color:#94a3b8">${escapeHtml(sub)}</span>` : ''}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9">${escapeHtml(where)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #f1f5f9;text-align:right"><strong style="color:#b91c1c">${qty}</strong> <span style="color:#94a3b8">/ ${level}</span></td>
    </tr>`
}

export async function runLowStockSweep(options: { dryRun?: boolean } = {}): Promise<LowStockRunResult> {
  const cleared = options.dryRun ? 0 : await clearRecoveredAlerts()
  const items = await findNewlyLowItems()
  const parts = await findNewlyLowParts()
  const total = items.length + parts.length

  const empty: LowStockRunResult = {
    newly_low: 0,
    newly_low_venue_stock: 0,
    newly_low_parts: 0,
    cleared,
    emailed: false,
    recipients: [],
    slack_venue_pings: 0,
  }
  if (total === 0) return empty

  if (options.dryRun) {
    return {
      ...empty,
      newly_low: total,
      newly_low_venue_stock: items.length,
      newly_low_parts: parts.length,
      recipients: await getLowStockRecipients(),
    }
  }

  // Record the alerts BEFORE sending. If the mail fails we would rather miss
  // one notification than re-alert the same shortage on every run.
  for (const item of items) {
    await query(
      `INSERT INTO inventory_low_stock_alerts (inventory_id, quantity_at_alert, threshold_at_alert)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [item.id, item.quantity, item.threshold_low],
    )
  }
  for (const part of parts) {
    await query(
      `INSERT INTO inventory_low_stock_alerts (part_id, quantity_at_alert, threshold_at_alert)
       VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [part.id, part.quantity, part.threshold_low],
    )
  }

  const byVenue = new Map<string, LowStockRow[]>()
  for (const item of items) {
    if (!item.venue_id) continue
    const list = byVenue.get(item.venue_id) || []
    list.push(item)
    byVenue.set(item.venue_id, list)
  }

  const rows = [
    ...items.map((item) =>
      stockRow(item.item_name, item.part_number, item.venue_name, item.quantity, item.threshold_low)),
    ...parts.map((part) =>
      stockRow(part.part_name, part.part_number, 'Parts catalog', part.quantity, part.threshold_low)),
  ].join('')

  const recipients = await getLowStockRecipients()
  let emailed = false
  if (recipients.length > 0) {
    emailed = await sendEmail(
      recipients,
      `Inventory running low — ${total} item${total === 1 ? '' : 's'}`,
      brandedEmail({
        title: 'Inventory running low',
        subtitle: `${total} item${total === 1 ? '' : 's'} at or below their reorder level`,
        bodyHtml: `
          <p style="margin:0 0 12px">These have just dropped to their reorder level. Each one is reported once — you will not be told again until it is restocked and drops a second time.</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr>
              <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b">ITEM</th>
              <th style="text-align:left;padding:8px 12px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b">WHERE</th>
              <th style="text-align:right;padding:8px 12px;border-bottom:2px solid #e2e8f0;font-size:11px;color:#64748b">ON HAND / LEVEL</th>
            </tr>
            ${rows}
          </table>
        `,
        footerNote: 'ANC Sports · inventory',
      }),
    )
  }

  // The venue's own channel gets its own shortages — the people who can walk
  // to the shelf are not the people on the ticket email list.
  let slackPings = 0
  for (const [, venueItems] of byVenue) {
    const channel = venueItems[0].slack_channel_id
    if (!channel) continue
    const lines = venueItems.map((i) => `• *${i.item_name}* — ${i.quantity} left (level ${i.threshold_low})`)
    const ok = await notifyOps(
      ':package:',
      `*Running low at ${venueItems[0].venue_name}*\n${lines.join('\n')}`,
      undefined,
      channel,
    )
    if (ok) slackPings += 1
  }

  return {
    newly_low: total,
    newly_low_venue_stock: items.length,
    newly_low_parts: parts.length,
    cleared,
    emailed,
    recipients,
    slack_venue_pings: slackPings,
  }
}

// ── RMA → stock ─────────────────────────────────────────────────────────────

export interface StockReturnResult {
  credited: boolean
  reason?: string
  inventory_id?: string
  quantity_before?: number
  quantity_after?: number
}

/**
 * Put a repaired part back into the venue's stock.
 *
 * Only fires when the RMA is marked remit-to-stock AND has reached a returned
 * state. Matches the venue's inventory on part number first, then on part
 * name, and creates the row when the venue has never carried that part — a
 * repaired unit arriving is exactly when a venue starts holding one.
 */
export async function returnRmaToStock(rmaId: string): Promise<StockReturnResult> {
  const client = await getClient()
  try {
    await client.query('BEGIN')

    const rmaRes = await client.query(
      `SELECT id, venue_id, part_number, part_name, quantities, remit_to_stock, status, stock_returned_at
       FROM rma_trackers WHERE id = $1 FOR UPDATE`,
      [rmaId],
    )
    const rma = rmaRes.rows[0]
    if (!rma) { await client.query('ROLLBACK'); return { credited: false, reason: 'RMA not found' } }
    if (rma.stock_returned_at) { await client.query('ROLLBACK'); return { credited: false, reason: 'Already returned to stock' } }
    if (!rma.remit_to_stock) { await client.query('ROLLBACK'); return { credited: false, reason: 'Not marked remit to stock' } }
    if (!rma.venue_id) { await client.query('ROLLBACK'); return { credited: false, reason: 'RMA has no venue' } }

    const qty = Number(rma.quantities) > 0 ? Number(rma.quantities) : 1

    const match = await client.query(
      `SELECT id, quantity FROM inventory
       WHERE venue_id = $1
         AND (
           ($2::text IS NOT NULL AND part_number IS NOT NULL AND lower(btrim(part_number)) = lower(btrim($2)))
           OR ($3::text IS NOT NULL AND lower(btrim(item_name)) = lower(btrim($3)))
         )
       ORDER BY (part_number IS NOT NULL) DESC
       LIMIT 1`,
      [rma.venue_id, rma.part_number, rma.part_name],
    )

    let inventoryId: string
    let before = 0
    if (match.rows[0]) {
      inventoryId = match.rows[0].id
      before = Number(match.rows[0].quantity) || 0
      await client.query(
        `UPDATE inventory SET quantity = quantity + $2, last_updated = NOW() WHERE id = $1`,
        [inventoryId, qty],
      )
    } else {
      const created = await client.query(
        `INSERT INTO inventory (venue_id, item_name, part_number, quantity)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [rma.venue_id, rma.part_name || rma.part_number || 'Repaired part', rma.part_number, qty],
      )
      inventoryId = created.rows[0].id
    }

    await client.query(
      `UPDATE rma_trackers SET stock_returned_at = NOW(), stock_returned_inventory_id = $2, updated_at = NOW()
       WHERE id = $1`,
      [rmaId, inventoryId],
    )

    // Stock going up can clear an open shortage.
    await client.query(
      `UPDATE inventory_low_stock_alerts a
       SET cleared_at = NOW()
       FROM inventory i
       WHERE a.inventory_id = i.id AND i.id = $1
         AND a.cleared_at IS NULL
         AND i.quantity > COALESCE(i.threshold_low, 5)`,
      [inventoryId],
    )

    await client.query('COMMIT')
    return { credited: true, inventory_id: inventoryId, quantity_before: before, quantity_after: before + qty }
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
}

/** RMA states that mean the part is physically back and usable. */
export function isReturnedToStockStatus(status: string | null | undefined): boolean {
  const s = (status || '').replace(/^STATUS_/i, '').toLowerCase()
  return s === 'returned' || s === 'closed' || s === 'completed'
}
