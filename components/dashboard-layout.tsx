'use client'

import { Sidebar } from './sidebar'

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-white">
      <Sidebar />
      <div className="lg:ml-60 flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto">
          <div className="p-4 pt-16 lg:p-8 lg:pt-8 max-w-screen-xl">
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}
