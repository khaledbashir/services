'use client'
import * as React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Sparkles, RefreshCw } from 'lucide-react'

interface CampaignRow {
  id: string
  name: string
  subject: string
  status: string
  sent_at: string | null
  scheduled_at: string | null
  recipient_count: number
  opened_count: number
  clicked_count: number
  unsubscribed_count: number
}

interface Props { campaigns: CampaignRow[] }

export function InsightsPage({ campaigns }: Props) {
  const [narratives, setNarratives] = React.useState<Record<string, { text: string; loading: boolean; err?: string }>>({})

  async function narrate(id: string) {
    setNarratives((n) => ({ ...n, [id]: { text: '', loading: true } }))
    try {
      const res = await fetch('/api/marketing/insights/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId: id }),
      })
      const data = await res.json()
      setNarratives((n) => ({ ...n, [id]: { text: data.narrative || '', loading: false, err: data.error } }))
    } catch (e) {
      setNarratives((n) => ({ ...n, [id]: { text: '', loading: false, err: String(e) } }))
    }
  }

  return (
    <div className="grid gap-3 p-6">
      {campaigns.length === 0 && (
        <Card className="p-6 text-center text-[12px] text-muted-foreground">
          No sent campaigns yet. Once you publish from the Compose canvas, insights show up here.
        </Card>
      )}
      {campaigns.map((c) => {
        const n = narratives[c.id]
        const openRate = c.recipient_count > 0 ? Math.round((c.opened_count / c.recipient_count) * 100) : 0
        const clickRate = c.recipient_count > 0 ? Math.round((c.clicked_count / c.recipient_count) * 100) : 0
        return (
          <Card key={c.id} className="overflow-hidden">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold tracking-tight truncate">{c.name}</div>
                <div className="text-[11.5px] text-muted-foreground truncate">{c.subject}</div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{c.status}</Badge>
                {c.sent_at && (
                  <Badge variant="ghost">sent {new Date(c.sent_at).toLocaleDateString()}</Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-px bg-border">
              <Metric label="recipients" value={c.recipient_count} />
              <Metric label="opened" value={c.opened_count} pct={openRate} />
              <Metric label="clicked" value={c.clicked_count} pct={clickRate} />
              <Metric label="unsubscribed" value={c.unsubscribed_count} tone={c.unsubscribed_count ? 'warn' : 'mute'} />
            </div>

            <div className="border-t border-border px-4 py-3">
              {!n && (
                <Button size="sm" variant="outline" onClick={() => narrate(c.id)}>
                  <Sparkles className="size-3" /> Read the room
                </Button>
              )}
              {n?.loading && (
                <span className="flex items-center gap-1 text-[12px] text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> Reading the numbers…
                </span>
              )}
              {n?.err && (
                <span className="text-[12px] text-destructive">{n.err}</span>
              )}
              {n?.text && (
                <div className="flex flex-col gap-2">
                  <pre className="whitespace-pre-wrap break-words font-sans text-[12.5px] leading-relaxed text-foreground/90">
                    {n.text}
                  </pre>
                  <Button size="sm" variant="ghost" onClick={() => narrate(c.id)} className="self-end">
                    <RefreshCw className="size-3" /> Re-read
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function Metric({ label, value, pct, tone = 'mute' }: { label: string; value: number; pct?: number; tone?: 'mute' | 'warn' }) {
  return (
    <div className="bg-card px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className={`text-[18px] font-semibold tabular-nums ${tone === 'warn' && value > 0 ? 'text-amber-400' : 'text-foreground'}`}>
          {value}
        </span>
        {pct !== undefined && (
          <span className="text-[11px] text-muted-foreground">· {pct}%</span>
        )}
      </div>
    </div>
  )
}
