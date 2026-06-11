import { redirect } from 'next/navigation'

// Retired 2026-06-11. Operations data now lives in the NocoDB workspace,
// embedded as an iframe at /operations — that is the single canonical surface.
// This old native table browser is kept only as a redirect so any existing
// bookmarks land on the right place.
export default function OperationsTablesRedirect() {
  redirect('/operations')
}
