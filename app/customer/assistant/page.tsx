'use client'

import PortalShell from '../PortalShell'
import { isCustomerPortalTabPendingApproval } from '@/lib/customer-portal-tabs'

/**
 * ANC Assistant — the tab exists so staff can switch it on per account, but
 * client access stays closed until ANC signs it off (Charlie 2026-08-10: "We
 * don't want clients using it yet till we fine tune it").
 *
 * The gate lives in the shared tab registry rather than in this file, so
 * turning it on is one edit in one place and the setup UI stays in step.
 */
function AssistantContent() {
  const pending = isCustomerPortalTabPendingApproval('assistant')

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="cp-page-title">ANC Assistant</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          Ask about your displays, requests, and schedule in plain language.
        </p>
      </div>

      {pending ? (
        <div className="cp-panel p-6">
          <div className="cp-section-title mb-2">Coming soon</div>
          <p className="text-sm" style={{ color: 'var(--anc-muted)', lineHeight: 1.6 }}>
            The assistant is being tuned for your account and isn&rsquo;t open yet.
            Your ANC team will switch it on once it&rsquo;s ready. In the meantime,
            Requests is the fastest way to reach us.
          </p>
        </div>
      ) : (
        <div className="cp-panel p-6">
          <p className="text-sm" style={{ color: 'var(--anc-muted)', lineHeight: 1.6 }}>
            Use the assistant in the corner of any page to file a request, check
            status, or work through a quick fix.
          </p>
        </div>
      )}
    </div>
  )
}

export default function CustomerAssistantPage() {
  return (
    <PortalShell active="ANC Assistant">
      <AssistantContent />
    </PortalShell>
  )
}
