'use client'

import { DashboardLayout } from '@/components/dashboard-layout'

// Operations Workspace = the ANC-branded NocoDB workspace, embedded full-bleed.
// The embed only works because our pinned NocoDB image neutralises the upstream
// anti-iframe guard (see anc-nocodb Dockerfile, 2026-06-23). If this ever shows
// "Not allowed", the NocoDB image regressed — re-check that patch, not this file.
const OPS_WORKSPACE_URL = 'https://nocodb.ancsports.net/w2116qsq'

export default function OperationsPage() {
  return (
    <DashboardLayout fullBleed>
      <iframe
        src={OPS_WORKSPACE_URL}
        title="ANC Operations"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </DashboardLayout>
  )
}
