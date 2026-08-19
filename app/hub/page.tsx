import { DashboardLayout } from '@/components/dashboard-layout'

// Two tones, both from the ANC wordmark, carrying a real distinction: brand
// blue marks the three systems that own a business workflow, cyan marks the
// three supporting surfaces. Six shades of one hue would be indistinguishable
// at 12px, so the dot groups rather than pretends to be a per-app legend.
const CORE = '#0A52EF'
const SUPPORT = '#00AEEF'

const apps = [
  {
    name: 'CRM',
    href: 'https://crm.ancsports.net',
    detail: 'Accounts, opportunities, contacts, dashboards, reports, and Scout.',
    color: CORE,
  },
  {
    name: 'Proposal Engine',
    href: 'https://proposals.anc.com/hub',
    detail: 'Estimates, RFP analysis, proposal generation, and scoping workbooks.',
    color: CORE,
  },
  {
    name: 'Services Dashboard',
    href: '/dashboard',
    detail: 'Events, venues, staffing, tickets, workflows, and service operations.',
    color: CORE,
  },
  {
    name: 'Operations Workspace',
    href: '/operations',
    detail: 'Dense ops tables for displays, walkthroughs, maintenance, and assets.',
    color: SUPPORT,
  },
  {
    name: 'ANC Forms',
    href: 'https://forms.ancsports.net',
    detail: 'Shareable intake forms for CRM and operations workflows.',
    color: SUPPORT,
  },
  {
    name: 'Operator Docs',
    href: 'https://docs.ancsports.net',
    detail: 'Guides, runbooks, workflows, and training notes.',
    color: SUPPORT,
  },
]

const quickLinks = [
  { label: 'Today dashboard', href: '/dashboard' },
  { label: 'Events', href: '/events' },
  { label: 'Tickets', href: '/tickets' },
  { label: 'New walkthrough', href: '/walkthroughs/new' },
  { label: 'Design requests', href: '/designs' },
]

const cardShell =
  'rounded border border-[#E8E8E8] bg-white shadow-sm dark:border-[var(--anc-border)] dark:bg-[var(--anc-surface)] dark:shadow-[0_20px_60px_rgba(0,0,0,0.22)]'

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
      <div className="min-h-full text-[var(--anc-text)]">
        <div className={`mb-6 p-5 ${cardShell}`}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--anc-brand)]">ANC Platform</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--anc-text)]">Unified app hub</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--anc-muted)]">
                One launch point for sales, proposals, services, forms, docs, and ops.
              </p>
            </div>
            <div className="rounded border border-[#0A52EF]/20 bg-[#0A52EF]/[0.06] px-3 py-2 text-sm font-medium text-[#0A52EF] dark:border-[#3b82f6]/25 dark:bg-[#3b82f6]/10 dark:text-[#93b8fb]">
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
                  className={`${cardShell} p-4 transition hover:-translate-y-0.5 hover:border-[#0A52EF]/40 hover:bg-[#0A52EF]/[0.03] hover:shadow-md dark:hover:border-white/20 dark:hover:bg-[var(--anc-surface-raised)]`}
                >
                  <div className="flex items-start justify-between gap-4 text-[var(--anc-muted)]">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: app.color }} />
                    <ArrowIcon />
                  </div>
                  <h2 className="mt-5 text-base font-semibold text-[var(--anc-text)]">{app.name}</h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--anc-muted)]">{app.detail}</p>
                </a>
              ))}
            </div>
          </section>

          <aside className="space-y-4">
            <div className={`${cardShell} p-4`}>
              <h2 className="text-base font-semibold text-[var(--anc-text)]">Services shortcuts</h2>
              <div className="mt-4 space-y-2">
                {quickLinks.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    className="flex items-center justify-between rounded border border-[#E8E8E8] px-3 py-2 text-sm font-medium text-[var(--anc-muted)] transition hover:border-[#0A52EF]/50 hover:bg-[#0A52EF]/[0.06] hover:text-[#0A52EF] dark:border-[var(--anc-border)] dark:hover:bg-[#0A52EF]/10 dark:hover:text-white"
                  >
                    {link.label}
                    <ArrowIcon />
                  </a>
                ))}
              </div>
            </div>

            <div className={`${cardShell} p-4`}>
              <h2 className="text-base font-semibold text-[var(--anc-text)]">Platform model</h2>
              <p className="mt-3 text-sm leading-6 text-[var(--anc-muted)]">
                Each system keeps the workflow it owns. Microsoft Entra gives the shared login layer across the platform.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  )
}
