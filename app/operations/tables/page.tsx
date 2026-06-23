import { redirect } from 'next/navigation'

// /operations is the canonical native operations surface (server-side proxied
// via the ops PAT — no iframe, works for every signed-in dashboard user).
// This route is kept only as a redirect so old bookmarks land in the right place.
export default function OperationsTablesRedirect() {
  redirect('/operations')
}
