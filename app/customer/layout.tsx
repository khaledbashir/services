import type { Metadata } from 'next'
import './customer.css'

export const metadata: Metadata = {
  title: 'ANC Customer Portal',
  description: 'Track and submit service requests',
}

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return <div className="cp-root">{children}</div>
}
