'use client'

import Link from 'next/link'
import PortalShell from '../PortalShell'

const STEPS = [
  ['File requests', 'Use Requests or AI Diagnosis for display issues, content concerns, service questions, or event-readiness items.'],
  ['Track work', 'Open requests show status, priority, venue, replies, and resolution history without digging through email.'],
  ['Use documents', 'ANC-shared reports, drawings, proof packages, specs, and reference files stay organized by venue.'],
  ['Escalate cleanly', 'Urgent service items should be filed as high or urgent so the ANC support path is triggered.'],
]

function OrientationContent() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="cp-page-title">Orientation</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          How the client should use the portal, what each area is for, and where service work starts.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {STEPS.map(([title, body], index) => (
          <div key={title} className="cp-panel p-5">
            <div className="cp-stat-label">Step {index + 1}</div>
            <h2 className="mt-2 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--anc-muted)' }}>{body}</p>
          </div>
        ))}
      </div>
      <div className="cp-panel mt-6 p-6">
        <h2 className="cp-section-title mb-3">Start here</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/customer/requests?new=1" className="cp-btn">Create request</Link>
          <Link href="/customer/diagnosis" className="cp-btn-ghost">Run diagnosis</Link>
          <Link href="/customer/documents" className="cp-btn-ghost">Open documents</Link>
        </div>
      </div>
    </div>
  )
}

export default function CustomerOrientationPage() {
  return (
    <PortalShell active="Orientation">
      <OrientationContent />
    </PortalShell>
  )
}
