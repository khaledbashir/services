import type { Metadata } from 'next'
import { SignalSidebar } from '@/components/signal/sidebar'

export const metadata: Metadata = {
  title: 'Signal — ANC Marketing',
}

export default function SignalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="signal-surface dark min-h-screen">
      <div className="flex min-h-screen">
        <SignalSidebar />
        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
