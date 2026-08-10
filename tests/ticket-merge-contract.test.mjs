import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { mergedTicketWriteError } from '../lib/ticket-merge-guard.ts'

test('merged ticket sources are read-only and identify their primary ticket', () => {
  assert.deepEqual(
    mergedTicketWriteError({
      merged_into_ticket_id: 'primary-id',
      merged_into_ticket_number: 1979,
    }),
    {
      error: 'This ticket was merged into T-01979. Continue work on the primary ticket.',
      merged_into_ticket_id: 'primary-id',
      merged_into_ticket_number: 1979,
    }
  )
  assert.equal(mergedTicketWriteError({ merged_into_ticket_id: null }), null)
})

test('ticket list and resolved search exclude merged sources', async () => {
  const [listRoute, searchRoute] = await Promise.all([
    readFile(new URL('../app/api/tickets/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/tickets/search/route.ts', import.meta.url), 'utf8'),
  ])

  assert.match(listRoute, /t\.merged_into_ticket_id IS NULL/)
  assert.match(searchRoute, /t\.merged_into_ticket_id IS NULL/)
})

test('ticket updates guard merged sources before applying direct fields', async () => {
  const route = await readFile(new URL('../app/api/tickets/[id]/route.ts', import.meta.url), 'utf8')
  const patchHandler = route.indexOf('export async function PATCH')
  const mergedGuard = route.indexOf('mergedTicketWriteError', patchHandler)
  const directFieldUpdate = route.indexOf('const directFields', patchHandler)

  assert.ok(mergedGuard > patchHandler, 'PATCH must check the merge pointer')
  assert.ok(mergedGuard < directFieldUpdate, 'the merge guard must run before any ticket field update')
})

test('the database keeps every merged source closed', async () => {
  const migrations = await readFile(new URL('../lib/db.ts', import.meta.url), 'utf8')
  assert.match(migrations, /tickets_merged_source_closed/)
  assert.match(migrations, /merged_into_ticket_id IS NULL OR status = 'closed'/)
})

test('opening a merged source in the UI replaces it with the primary route', async () => {
  const detail = await readFile(new URL('../components/ticket-detail.tsx', import.meta.url), 'utf8')
  assert.match(detail, /router\.replace\(`\/tickets\/\$\{ticketData\.ticket\.merged_into_ticket_id\}`\)/)
})
