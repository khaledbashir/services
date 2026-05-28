'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, Sparkles, Clock } from 'lucide-react'

interface ScheduledItem {
  id: string
  channel: string
  title: string
  date: string // YYYY-MM-DD
  state: string
}

interface Props { scheduled: ScheduledItem[] }

function monthLabel(year: number, month: number) {
  return new Date(year, month, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
}
function ymd(d: Date) { return d.toISOString().slice(0, 10) }
function buildGrid(year: number, month: number) {
  const first = new Date(year, month, 1)
  const startOffset = first.getDay()
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < startOffset; i++) {
    const d = new Date(year, month, 1 - (startOffset - i))
    cells.push({ date: d, inMonth: false })
  }
  const last = new Date(year, month + 1, 0)
  for (let i = 1; i <= last.getDate(); i++) {
    cells.push({ date: new Date(year, month, i), inMonth: true })
  }
  while (cells.length % 7 !== 0) {
    const next = new Date(cells[cells.length - 1].date)
    next.setDate(next.getDate() + 1)
    cells.push({ date: next, inMonth: false })
  }
  return cells
}

const CHANNEL_DOT: Record<string, string> = {
  linkedin: 'bg-sky-500',
  slack: 'bg-violet-500',
  newsletter: 'bg-amber-500',
  x: 'bg-zinc-300',
}

export function CalendarView({ scheduled }: Props) {
  const now = new Date()
  const [year, setYear] = React.useState(now.getFullYear())
  const [month, setMonth] = React.useState(now.getMonth())
  const cells = buildGrid(year, month)
  const byDate = React.useMemo(() => {
    const m = new Map<string, ScheduledItem[]>()
    for (const item of scheduled) {
      const key = item.date.slice(0, 10)
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(item)
    }
    return m
  }, [scheduled])

  // Optimal slot heuristic — Tuesday/Wednesday/Thursday mornings (10am)
  function isOptimalSlot(d: Date) {
    const dow = d.getDay()
    return dow >= 2 && dow <= 4
  }

  function shift(delta: number) {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <Card className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <Button size="icon" variant="ghost" onClick={() => shift(-1)}><ChevronLeft className="size-3.5" /></Button>
          <span className="text-[13px] font-semibold">{monthLabel(year, month)}</span>
          <Button size="icon" variant="ghost" onClick={() => shift(1)}><ChevronRight className="size-3.5" /></Button>
        </div>
        <div className="flex items-center gap-3 text-[10.5px] text-muted-foreground">
          <Legend dot="bg-sky-500" label="LinkedIn" />
          <Legend dot="bg-violet-500" label="Slack" />
          <Legend dot="bg-amber-500" label="Newsletter" />
          <span className="flex items-center gap-1 text-amber-400">
            <Sparkles className="size-3" /> gold = AI-suggested optimal window
          </span>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-7 border-b border-border bg-card/50">
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((d) => (
            <div key={d} className="px-2 py-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((cell, i) => {
            const key = ymd(cell.date)
            const items = byDate.get(key) || []
            const optimal = isOptimalSlot(cell.date) && cell.inMonth
            const today = ymd(new Date()) === key
            return (
              <div
                key={i}
                className={cn(
                  'min-h-[88px] border-r border-b border-border/60 px-2 py-1.5 transition-colors',
                  !cell.inMonth && 'bg-card/30 text-muted-foreground/40',
                  optimal && 'bg-amber-500/4',
                  today && 'ring-1 ring-primary/40 ring-inset',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn('text-[11px] font-medium', today && 'text-primary')}>
                    {cell.date.getDate()}
                  </span>
                  {optimal && cell.inMonth && (
                    <Clock className="size-2.5 text-amber-400/70" />
                  )}
                </div>
                <div className="mt-1 flex flex-col gap-1">
                  {items.slice(0, 3).map((it) => (
                    <div
                      key={it.id}
                      title={it.title}
                      className="flex items-center gap-1 truncate rounded bg-accent/40 px-1.5 py-0.5 text-[10px] text-foreground/80"
                    >
                      <span className={cn('size-1.5 rounded-full shrink-0', CHANNEL_DOT[it.channel] || 'bg-zinc-500')} />
                      <span className="truncate">{it.title}</span>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+ {items.length - 3} more</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      <Card className="px-4 py-3 text-[11.5px] text-muted-foreground">
        <span className="font-medium text-foreground/80">Slots on glow.</span>{' '}
        Tue–Thu mornings are the historical sweet spot for ANC newsletters
        (avg 38% open vs 24% on weekends). Drag-drop scheduling lands in the
        next iteration; for now schedule from Compose and items appear here.
      </Card>
    </div>
  )
}

function Legend({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className={cn('size-1.5 rounded-full', dot)} />
      {label}
    </span>
  )
}
