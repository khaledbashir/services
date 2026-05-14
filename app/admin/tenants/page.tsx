import type { Metadata } from 'next'
import TenantManager from './TenantManager'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const metadata: Metadata = {
  title: 'Tenants — Admin',
  robots: { index: false, follow: false },
}

export default function AdminTenantsPage() {
  return (
    <div className="max-w-6xl mx-auto px-6 pt-8 pb-16 w-full min-w-0">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Each tenant is a client of yours. Set their retainer terms, branding, and which pages they see.
        </p>
      </div>
      <TenantManager />
    </div>
  )
}
