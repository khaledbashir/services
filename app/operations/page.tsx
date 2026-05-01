'use client'

import { DashboardLayout } from '@/components/dashboard-layout'

// Operations workspace — embeds the Twenty-backed ops platform inside the
// services-dashboard chrome. End users see one URL (services.ancsports.net/
// operations), one nav, one login. The iframe transparently loads
// ops.ancsports.net which has been ANC-rebranded source-side.
//
// Cookie-domain SSO (Twenty configured with Domain=.ancsports.net) means a
// single login covers both apps. If the user isn't yet authenticated, the
// iframe shows Twenty's login; after that one-time login the cookie sticks.
//
// Legacy NocoDB-headless implementation lives at app/operations/page.legacy.tsx.bak —
// retained during transition in case rollback is needed.

export default function OperationsPage() {
  return (
    <DashboardLayout>
      <iframe
        src="https://nocodb.ancsports.net/"
        title="ANC Operations"
        style={{
          width: '100%',
          height: 'calc(100vh - 64px)',
          border: 'none',
          display: 'block',
          margin: 0,
          padding: 0,
        }}
        // sandbox left off — Twenty needs full cookie + storage access for SSO
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </DashboardLayout>
  )
}
