'use client'

import { DashboardLayout } from '@/components/dashboard-layout'

export default function KnowledgePage() {
  return (
    <DashboardLayout>
      <div className="h-[calc(100vh-2rem)] flex flex-col">
        {/* Minimal header */}
        <div className="flex items-center justify-between mb-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0A52EF] to-[#002C73] flex items-center justify-center shadow-lg shadow-[#0A52EF]/20">
              <img src="/ANC_Logo_2023_white.png" alt="" className="h-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-zinc-900">
                Knowledge Base
                <span className="ml-2 text-[10px] bg-[#0A52EF]/10 text-[#0A52EF] px-2 py-0.5 rounded-full font-medium align-middle">Preview</span>
              </h1>
              <p className="text-[11px] text-zinc-400">Browse articles, search, or ask AI — powered by Outline</p>
            </div>
          </div>
          <a
            href="https://abc-outline.izcgmb.easypanel.host"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-zinc-400 hover:text-[#0A52EF] border border-zinc-200 hover:border-[#0A52EF]/30 px-3 py-1.5 rounded-lg transition-colors"
          >
            Open full view ↗
          </a>
        </div>

        {/* Outline iframe */}
        <div className="flex-1 rounded-xl border border-zinc-200 overflow-hidden shadow-sm bg-white">
          <iframe
            src="https://abc-outline.izcgmb.easypanel.host"
            className="w-full h-full border-0"
            title="ANC Knowledge Base"
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </div>
    </DashboardLayout>
  )
}
