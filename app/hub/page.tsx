import { DashboardLayout } from '@/components/dashboard-layout'

const apps = [
  {
    name: 'CRM',
    href: 'https://crm.ancsports.net',
    detail: 'Accounts, opportunities, contacts, dashboards, reports, and Scout.',
    color: '#0A52EF',
  },
  {
    name: 'Proposal Engine',
    href: 'https://proposals.anc.com/hub',
    detail: 'Estimates, RFP analysis, proposal generation, and scoping workbooks.',
    color: '#10b981',
  },
  {
    name: 'Services Dashboard',
    href: '/dashboard',
    detail: 'Events, venues, staffing, tickets, workflows, and service operations.',
    color: '#ffffff',
  },
  {
    name: 'Operations Workspace',
    href: '/operations',
    detail: 'Dense ops tables for displays, walkthroughs, maintenance, and assets.',
    color: '#f59e0b',
  },
  {
    name: 'ANC Forms',
    href: 'https://forms.ancsports.net',
    detail: 'Shareable intake forms for CRM and operations workflows.',
    color: '#06b6d4',
  },
  {
    name: 'Operator Docs',
    href: 'https://docs.ancsports.net',
    detail: 'Guides, runbooks, workflows, and training notes.',
    color: '#818cf8',
  },
]

const quickLinks = [
  { label: 'Today dashboard', href: '/dashboard' },
  { label: 'Events', href: '/events' },
  { label: 'Tickets', href: '/tickets' },
  { label: 'Design requests', href: '/designs' },
]

function ArrowIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 17 17 7m0 0H9m8 0v8" />
    </svg>
  )
}

export default function HubPage() {
  return (
    <DashboardLayout>
      <div className="min-h-full text-white">
        <div className="mb-6 rounded border border-white/10 bg-[#151515] p-5 shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#60a5fa]">ANC Platform</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Unified app hub</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
                One launch point for sales, proposals, services, forms, docs, and ops.
              </p>
            </div>
            <div className="rounded border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-sm font-medium text-emerald-100">
              Microsoft identity layer
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <section>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {apps.map((app) => (
                <a
                  key={app.name}
                  href={app.href}
                  className="rounded border border-white/10 bg-[#151515] p-4 transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-[#191919]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: app.color }} />
                    <ArrowIcon />
                  </div>
                  <h2 className="mt-5 text-base font-semibold text-white">{app.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-zinc-400">{app.detail}</p>
                </a>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <div className="rounded border border-white/10 bg-[#151515] p-4">
              <h2 className="text-base font-semibold text-white">Services shortcuts</h2>
              <div className="mt-4 space-y-2">
                {quickLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded border border-white/10 px-3 py-2 text-sm font-medium text-zinc-300 transition hover:border-[#0A52EF]/50 hover:bg-[#0A52EF]/10 hover:text-white"
                  >
                    {link.label}
                    <ArrowIcon />
                  </a>
                ))}
              </div>
            </div>

            <div className="rounded border border-white/10 bg-[#151515] p-4">
              <h2 className="text-base font-semibold text-white">Platform model</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">
                Each system keeps the workflow it owns. Microsoft Entra gives the shared login layer across the platform.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  )
}
