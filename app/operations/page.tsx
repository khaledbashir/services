'use client'

import { DashboardLayout } from '@/components/dashboard-layout'

const OPS_URL = 'https://ops.ancsports.net/'

export default function OperationsPage() {
  return (
    <DashboardLayout>
      <div style={{ position: 'relative', height: 'calc(100vh - 64px)' }}>
        <iframe
          src={OPS_URL}
          title="ANC Operations"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            display: 'block',
            margin: 0,
            padding: 0,
          }}
          allow="clipboard-read; clipboard-write; fullscreen"
        />
        <a
          href={OPS_URL}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            position: 'absolute',
            top: 12,
            right: 16,
            zIndex: 10,
            background: 'rgba(10, 82, 239, 0.95)',
            color: '#fff',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 500,
            textDecoration: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          Open in new tab ↗
        </a>
      </div>
    </DashboardLayout>
  )
}
