import Link from 'next/link'
import { DashboardLayout } from '@/components/dashboard-layout'
import { MorningCommandActions } from '@/components/morning-command-actions'
import { buildMorningCommandCenter } from '@/lib/ai/skills/morning-command-center'

export const dynamic = 'force-dynamic'

type Row = Record<string, unknown>

function asText(value: unknown, fallback = '-'): string {
  if (value === null || value === undefined || value === '') return fallback
  return String(value)
}

function asNumber(value: unknown): number {
  return Number(value || 0)
}

function urgencyClass(urgency: string) {
  if (urgency === 'High') return 'bg-rose-50 text-rose-700 border-rose-200'
  if (urgency === 'Medium') return 'bg-amber-50 text-amber-700 border-amber-200'
  return 'bg-emerald-50 text-emerald-700 border-emerald-200'
}

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded border border-[#E8E8E8] bg-white p-4 shadow-sm dark:border-[var(--anc-border)] dark:bg-[var(--anc-surface)]">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">{value}</div>
      {sub ? <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{sub}</div> : null}
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded border border-dashed border-[#D8D8D8] bg-zinc-50 px-4 py-5 text-sm text-zinc-500 dark:border-[var(--anc-border)] dark:bg-[var(--anc-surface-muted)]">{text}</div>
}

function RecordList({
  title,
  rows,
  type,
}: {
  title: string
  rows: Row[]
  type: 'ticket' | 'event' | 'venue' | 'walkthrough' | 'part'
}) {
  const hrefFor = (row: Row) => {
    if (type === 'ticket') return `/tickets/${row.id}`
    if (type === 'event') return `/events/${row.id}`
    if (type === 'venue') return `/venues/${row.id}`
    return null
  }

  const primary = (row: Row) => {
    if (type === 'ticket') return `${row.ticket_number ? `#${row.ticket_number} ` : ''}${asText(row.title, 'Untitled ticket')}`
    if (type === 'event') return asText(row.summary, 'Untitled event')
    if (type === 'venue') return asText(row.name, 'Venue')
    if (type === 'part') return asText(row.item_name, 'Inventory item')
    return `${asText(row.log_date, 'Recent walkthrough')}${row.venue_name ? ` - ${row.venue_name}` : ''}`
  }

  const meta = (row: Row) => {
    if (type === 'ticket') {
      return [row.venue_name, row.priority, row.sla_resolution_due_label ? `due ${row.sla_resolution_due_label}` : null, row.age_hours ? `${row.age_hours}h old` : null].filter(Boolean).join(' / ')
    }
    if (type === 'event') {
      const assigned = asNumber(row.assigned_count)
      return [row.venue_name, row.local_time, assigned > 0 ? `${assigned} assigned` : 'unassigned'].filter(Boolean).join(' / ')
    }
    if (type === 'venue') {
      return [
        `${asNumber(row.open_ticket_count)} open tickets`,
        asNumber(row.urgent_ticket_count) > 0 ? `${asNumber(row.urgent_ticket_count)} urgent` : null,
        asNumber(row.unassigned_event_count) > 0 ? `${asNumber(row.unassigned_event_count)} unassigned events` : null,
        asNumber(row.low_stock_count) > 0 ? `${asNumber(row.low_stock_count)} low-stock items` : null,
      ].filter(Boolean).join(' / ')
    }
    if (type === 'part') {
      return [row.venue_name, `${asNumber(row.quantity)} on hand`, `low threshold ${asNumber(row.threshold_low)}`].filter(Boolean).join(' / ')
    }
    return [row.result, row.issues_found || row.notes].filter(Boolean).join(' / ')
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h2>
      {rows.length === 0 ? (
        <EmptyState text="No active signal in this section right now." />
      ) : (
        <div className="overflow-hidden rounded border border-[#E8E8E8] bg-white shadow-sm dark:border-[var(--anc-border)] dark:bg-[var(--anc-surface)]">
          {rows.map((row, index) => {
            const href = hrefFor(row)
            const content = (
              <>
                <div className="font-medium text-zinc-900 dark:text-zinc-100">{primary(row)}</div>
                <div className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{meta(row)}</div>
              </>
            )
            return href ? (
              <Link key={`${type}-${asText(row.id, String(index))}`} href={href} className="block border-b border-[#E8E8E8] px-4 py-3 text-sm transition last:border-b-0 hover:bg-zinc-50 dark:border-[var(--anc-border)] dark:hover:bg-[var(--anc-surface-muted)]">
                {content}
              </Link>
            ) : (
              <div key={`${type}-${index}`} className="border-b border-[#E8E8E8] px-4 py-3 text-sm last:border-b-0 dark:border-[var(--anc-border)]">
                {content}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

export default async function MorningCommandCenterPage() {
  const data = await buildMorningCommandCenter({ horizon_days: 7, max_items: 6 })
  const m = data.metrics
  const generatedAt = new Date().toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const actions = [
    {
      label: 'Build Readiness Checklist',
      description: 'Pick the venue or event, ask missing questions, then produce a usable checklist.',
      prompt: 'Using the Morning Command Center analysis I have open, build a readiness checklist. First ask me which venue or event this should be for if it is not obvious, then ask any missing operational questions. Do not create or save anything until I say go.',
    },
    {
      label: 'Recommend Staffing',
      description: 'Review unassigned events and suggest coverage without changing assignments.',
      prompt: 'Using the Morning Command Center analysis I have open, recommend staffing for the unassigned events. Explain why each technician is a good fit based on venue familiarity, workload, and conflicts. Ask before making any assignment, and do not assign until I say go.',
    },
    {
      label: 'Draft Client Update',
      description: 'Turn the highest-risk ticket into clean external language.',
      prompt: 'Using the Morning Command Center analysis I have open, draft a client-safe update for the highest priority ticket. Use only external-safe ticket details, avoid internal notes, and ask which ticket if there is ambiguity.',
    },
    {
      label: 'Create Ops Doc',
      description: 'Prepare a day-plan document for NocoDB or the ops workspace.',
      prompt: 'Using the Morning Command Center analysis I have open, turn this into an ops day-plan document. Ask me whether to save it in NocoDB docs, CRM notes, or just preview it first. Do not write anything until I say go.',
    },
    {
      label: 'Save CRM Note',
      description: 'Attach the analysis to the right account, venue, or opportunity.',
      prompt: 'Using the Morning Command Center analysis I have open, prepare a CRM note version. Ask me which account, venue, or opportunity it belongs on before saving. Do not save until I say go.',
    },
    {
      label: 'Run Venue Health',
      description: 'Open the first risky venue and analyze tickets, events, staffing, and parts.',
      prompt: 'Using the Morning Command Center analysis I have open, run a venue health report for the first risky venue. If there is more than one candidate, ask me which venue to use first.',
    },
  ]

  return (
    <DashboardLayout>
      <div className="space-y-8">
        <header className="border-b border-[#E8E8E8] pb-6 dark:border-[var(--anc-border)]">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Operations AI</div>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">Morning Command Center</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
                A live read on what should happen today, what the system used to decide that, and which follow-up actions are ready for the assistant to run.
              </p>
            </div>
            <div className={`rounded border px-3 py-2 text-sm font-semibold ${urgencyClass(data.urgency)}`}>
              {data.urgency} urgency / {data.risk_points} risk points
            </div>
          </div>
          <div className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">Generated {generatedAt}</div>
        </header>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="Today" value={asNumber(m.events_today)} sub={`${asNumber(m.open_tickets)} open tickets, ${asNumber(m.urgent_open_tickets)} urgent`} />
          <Metric label="SLA Pressure" value={asNumber(m.sla_due_24h)} sub="tickets due within 24 hours" />
          <Metric label="Staffing Coverage" value={`${asNumber(m.staffing_coverage_percent)}%`} sub={`${asNumber(m.unassigned_events_horizon)} unassigned in ${asNumber(m.horizon_days)} days`} />
          <Metric label="Automation" value={`${asNumber(m.automated_ticket_percent_last_7_days)}%`} sub={`${asNumber(m.ai_tool_runs_last_7_days)} assistant tool runs in 7 days`} />
        </section>

        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="space-y-8">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">What Should Happen Today</h2>
              <div className="rounded border border-[#E8E8E8] bg-white p-5 shadow-sm dark:border-[var(--anc-border)] dark:bg-[var(--anc-surface)]">
                <ol className="space-y-3">
                  {data.top_actions.slice(0, 6).map((action, index) => (
                    <li key={action} className="flex gap-3 text-sm leading-6 text-zinc-700 dark:text-zinc-300">
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded bg-zinc-100 text-xs font-semibold text-zinc-700 dark:bg-[var(--anc-surface-muted)] dark:text-zinc-200">{index + 1}</span>
                      <span>{action}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </section>

            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Why This Is The Priority</h2>
              <div className="rounded border border-[#E8E8E8] bg-white p-5 shadow-sm dark:border-[var(--anc-border)] dark:bg-[var(--anc-surface)]">
                <ul className="space-y-3">
                  {data.rationale.map((reason) => (
                    <li key={reason} className="text-sm leading-6 text-zinc-700 dark:text-zinc-300">{reason}</li>
                  ))}
                </ul>
              </div>
            </section>

            <div className="grid gap-8 lg:grid-cols-2">
              <RecordList title="Ticket Risk" rows={data.ticket_risks as Row[]} type="ticket" />
              <RecordList title="Today's Events" rows={data.todays_events as Row[]} type="event" />
              <RecordList title="Staffing Gaps" rows={data.staffing_gaps as Row[]} type="event" />
              <RecordList title="Venue Risk" rows={data.venue_risks as Row[]} type="venue" />
              <RecordList title="Walkthrough Follow-Up" rows={data.walkthrough_issues as Row[]} type="walkthrough" />
              <RecordList title="Parts Watch" rows={data.low_stock as Row[]} type="part" />
            </div>
          </main>

          <aside className="space-y-4">
            <section className="space-y-3">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">AI Action Launchers</h2>
              <MorningCommandActions actions={actions} />
            </section>
            <section className="rounded border border-[#E8E8E8] bg-zinc-50 p-4 dark:border-[var(--anc-border)] dark:bg-[var(--anc-surface-muted)]">
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Evidence Used</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                Events, assignments, tickets, SLA dates, venues, walkthrough logs, inventory thresholds, assistant usage, and automated ticket sources.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div><span className="block font-semibold text-zinc-900 dark:text-zinc-100">{asNumber(m.events_horizon)}</span><span className="text-zinc-500">events in horizon</span></div>
                <div><span className="block font-semibold text-zinc-900 dark:text-zinc-100">{asNumber(m.walkthrough_issue_signals)}</span><span className="text-zinc-500">walkthrough signals</span></div>
                <div><span className="block font-semibold text-zinc-900 dark:text-zinc-100">{asNumber(m.low_stock_items)}</span><span className="text-zinc-500">low-stock items</span></div>
                <div><span className="block font-semibold text-zinc-900 dark:text-zinc-100">{asNumber(m.ai_users_last_7_days)}</span><span className="text-zinc-500">AI users in 7 days</span></div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  )
}
