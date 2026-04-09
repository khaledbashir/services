import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'ANC Request Forms',
  description: 'Submit design, print, and parts requests to the ANC ops team',
}

export default function FormsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-[var(--anc-border)]">
        <div className="max-w-2xl mx-auto px-6 py-5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--anc-brand)] flex items-center justify-center">
            <span className="text-white text-sm font-bold">ANC</span>
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">ANC Sports</div>
            <div className="text-xs text-gray-500">Request intake</div>
          </div>
        </div>
      </header>
      <main className="max-w-2xl mx-auto px-6 py-10">{children}</main>
      <footer className="max-w-2xl mx-auto px-6 py-8 text-center text-xs text-gray-400">
        Powered by ANC Services · Submissions route directly to the CRM
      </footer>
    </div>
  )
}
