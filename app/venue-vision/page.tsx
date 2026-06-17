'use client'

import Link from 'next/link'
import { Box, CheckCircle2, ExternalLink, FileCheck2, Layers3, MessageSquarePlus, MonitorUp, Sparkles } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { ThemeToggle } from '@/components/theme-toggle'

const VENUE_VISION_URL = 'https://abc-3d.izcgmb.easypanel.host/'

const useCases = [
  {
    label: 'Deal deck visual',
    body: 'Drop a proposed LED layout into a sales story before the client sees a quote.',
    icon: <MonitorUp className="h-4 w-4" />,
  },
  {
    label: 'Client approval',
    body: 'Let a client review display placement, content zones, and sponsor inventory in one view.',
    icon: <FileCheck2 className="h-4 w-4" />,
  },
  {
    label: 'Asset map',
    body: 'Use the model as a living venue map for screens, sections, service history, and open risks.',
    icon: <Layers3 className="h-4 w-4" />,
  },
  {
    label: 'Issue intake',
    body: 'Turn a clicked board or section into a ticket with photo upload, AI diagnosis, and routing.',
    icon: <MessageSquarePlus className="h-4 w-4" />,
  },
]

const flow = [
  'Configure venue',
  'Review placement',
  'Capture visual',
  'Publish to portal',
]

export default function VenueVisionPage() {
  return (
    <DashboardLayout fullBleed>
      <main className="flex h-full min-h-0 flex-col bg-[#f7f9fc] text-zinc-950 dark:bg-[#05070a] dark:text-white">
        <header className="flex shrink-0 flex-col gap-4 border-b border-zinc-200 bg-white/88 px-5 py-4 shadow-sm backdrop-blur dark:border-white/10 dark:bg-[#090d12]/92 lg:flex-row lg:items-center lg:justify-between lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-[#0A52EF] shadow-[0_18px_36px_-24px_rgba(10,82,239,0.9)]">
              <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-5 w-auto" />
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-[#0A52EF] dark:text-[#03b4ff]">Visual Output Studio</p>
              <h1 className="truncate text-2xl font-black tracking-tight text-zinc-950 dark:text-white">Venue Vision 3D</h1>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-white/50">Interactive venue configurator for proposals, approvals, asset maps, and client portals.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="hidden w-44 rounded-md border border-zinc-200 bg-white text-zinc-600 shadow-sm dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400 sm:block">
              <ThemeToggle />
            </div>
            <Link
              href="/presentation/new"
              className="inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-[#0A52EF]/40 hover:text-[#0A52EF] dark:border-white/15 dark:bg-white/[0.04] dark:text-white/70 dark:hover:border-[#03b4ff]/50 dark:hover:text-white"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Studio Home
            </Link>
            <a
              href={VENUE_VISION_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-[#0A52EF] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0840C0]"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open full 3D
            </a>
          </div>
        </header>

        <section className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-5">
          <div className="min-h-[620px] overflow-hidden rounded-lg border border-zinc-200 bg-zinc-950 shadow-[0_22px_70px_-40px_rgba(10,82,239,0.55)] dark:border-white/10">
            <iframe
              title="ANC Venue Vision 3D configurator"
              src={VENUE_VISION_URL}
              className="h-full min-h-[620px] w-full bg-zinc-950"
              allow="fullscreen; clipboard-write"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>

          <aside className="flex min-h-0 flex-col gap-4">
            <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
              <div className="flex items-center gap-2">
                <span className="grid h-8 w-8 place-items-center rounded-md bg-[#0A52EF]/10 text-[#0A52EF] dark:bg-[#03b4ff]/10 dark:text-[#03b4ff]">
                  <Box className="h-4 w-4" />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-zinc-400 dark:text-white/35">Module role</p>
                  <h2 className="text-sm font-black text-zinc-950 dark:text-white">Venue digital twin</h2>
                </div>
              </div>
              <p className="mt-4 text-sm leading-6 text-zinc-600 dark:text-white/58">
                Use this as the visual layer for the same work already moving through ANC: sales proposals, client approvals, service records, and support intake.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {flow.map((item, index) => (
                  <div key={item} className="rounded-md border border-zinc-200 bg-[#f7f9fc] p-3 dark:border-white/10 dark:bg-white/[0.04]">
                    <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-white/35">
                      <CheckCircle2 className="h-3.5 w-3.5 text-[#16A34A]" />
                      0{index + 1}
                    </div>
                    <div className="mt-2 text-sm font-semibold text-zinc-900 dark:text-white">{item}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-3">
              {useCases.map((item) => (
                <div key={item.label} className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.045]">
                  <div className="flex items-center gap-2 text-[#0A52EF] dark:text-[#03b4ff]">
                    {item.icon}
                    <h3 className="text-sm font-black uppercase tracking-tight text-zinc-950 dark:text-white">{item.label}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-white/58">{item.body}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>
    </DashboardLayout>
  )
}
