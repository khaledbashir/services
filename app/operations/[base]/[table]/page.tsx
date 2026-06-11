import { redirect } from 'next/navigation'

// Retired 2026-06-11. The native per-table viewer is replaced by the embedded
// NocoDB workspace at /operations. Redirect old deep links to that surface.
export default function OperationsTableRedirect() {
  redirect('/operations')
}
