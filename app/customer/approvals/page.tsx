'use client'

import { useState } from 'react'
import PortalShell from '../PortalShell'

type Approval = {
  id: string
  title: string
  venue: string
  status: 'needs_review' | 'approved' | 'changes'
  detail: string
}

const INITIAL: Approval[] = [
  { id: 'proof-main-concourse', title: 'Main concourse proof package', venue: 'Primary venue', status: 'needs_review', detail: 'Review the latest proof package and either approve it or request changes.' },
  { id: 'ribbon-template', title: 'Ribbon board creative template', venue: 'Primary venue', status: 'approved', detail: 'Approved template currently available in documents.' },
  { id: 'sponsor-rotation', title: 'Sponsor rotation scope', venue: 'Secondary venue', status: 'changes', detail: 'Client requested a revised rotation sequence before approval.' },
]

function ApprovalsContent() {
  const [items, setItems] = useState(INITIAL)

  function update(id: string, status: Approval['status']) {
    setItems(current => current.map(item => item.id === id ? { ...item, status } : item))
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="cp-page-title">Approvals</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          Client-facing review queue for proof files, scope decisions, and change requests.
        </p>
      </div>
      <div className="cp-panel overflow-hidden">
        {items.map(item => (
          <div key={item.id} className="cp-row">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span className={`cp-led ${item.status === 'approved' ? 'is-done' : item.status === 'changes' ? 'is-wait' : 'is-work'}`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{item.title}</div>
                <div className="mt-1 text-xs" style={{ color: 'var(--anc-muted)' }}>{item.venue} · {item.detail}</div>
              </div>
              <span className={`cp-chip ${item.status === 'approved' ? 'p-low' : item.status === 'changes' ? 'p-high' : 'p-medium'}`}>
                {item.status.replace(/_/g, ' ')}
              </span>
              <div className="flex gap-2">
                <button type="button" className="cp-btn-ghost" onClick={() => update(item.id, 'changes')}>Request changes</button>
                <button type="button" className="cp-btn" onClick={() => update(item.id, 'approved')}>Approve</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function CustomerApprovalsPage() {
  return (
    <PortalShell active="Approvals">
      <ApprovalsContent />
    </PortalShell>
  )
}
