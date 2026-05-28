'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { ChannelPill } from '@/components/ui/toggle'
import { Card } from '@/components/ui/card'
import { MessageSquare, Mail, Sparkles, Loader2, RotateCcw, Check } from 'lucide-react'
import type { ChannelKey } from '@/lib/signal/voice'

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.61 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 11-.001-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  )
}
function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M18.244 2H21l-6.52 7.45L22 22h-6.36l-4.99-6.53L4.92 22H2.16l6.97-7.97L2 2h6.52l4.51 5.97L18.244 2zm-1.11 18.36h1.76L6.94 3.55h-1.9l12.094 16.81z" />
    </svg>
  )
}

interface ChannelDef {
  key: ChannelKey
  label: string
  icon: React.ReactNode
  hint: string
}
const CHANNELS: ChannelDef[] = [
  { key: 'linkedin', label: 'LinkedIn', icon: <LinkedinIcon className="size-3.5" />, hint: '60–200 words, professional' },
  { key: 'x', label: 'X', icon: <TwitterIcon className="size-3.5" />, hint: '≤240 chars, punchy' },
  { key: 'slack', label: 'Slack', icon: <MessageSquare className="size-3.5" />, hint: 'casual, internal' },
  { key: 'newsletter', label: 'Newsletter', icon: <Mail className="size-3.5" />, hint: 'section with bold lead' },
]

interface Generation {
  channel: ChannelKey
  text: string
  status: 'idle' | 'streaming' | 'done' | 'error'
}

export function ComposeCanvas() {
  const [brief, setBrief] = React.useState('')
  const [selected, setSelected] = React.useState<Set<ChannelKey>>(new Set(['linkedin']))
  const [generations, setGenerations] = React.useState<Record<ChannelKey, Generation>>(() =>
    Object.fromEntries(CHANNELS.map((c) => [c.key, { channel: c.key, text: '', status: 'idle' as const }])) as Record<ChannelKey, Generation>,
  )
  const [running, setRunning] = React.useState(false)

  const toggle = (k: ChannelKey) => {
    setSelected((prev) => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      if (n.size === 0) n.add(k)
      return n
    })
  }

  const composeOne = async (channel: ChannelKey) => {
    setGenerations((g) => ({ ...g, [channel]: { channel, text: '', status: 'streaming' } }))
    try {
      const res = await fetch('/api/signal/compose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brief, channel }),
      })
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`)
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setGenerations((g) => ({ ...g, [channel]: { channel, text: acc, status: 'streaming' } }))
      }
      setGenerations((g) => ({ ...g, [channel]: { channel, text: acc, status: 'done' } }))
    } catch (err) {
      setGenerations((g) => ({ ...g, [channel]: { channel, text: String(err), status: 'error' } }))
    }
  }

  const runAll = async () => {
    if (!brief.trim() || running) return
    setRunning(true)
    const targets = CHANNELS.filter((c) => selected.has(c.key)).map((c) => c.key)
    await Promise.all(targets.map(composeOne))
    setRunning(false)
  }

  const reset = (k: ChannelKey) => {
    setGenerations((g) => ({ ...g, [k]: { channel: k, text: '', status: 'idle' } }))
  }

  const onKey = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      runAll()
    }
  }

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-[1fr_1.4fr]">
      {/* LEFT — brief */}
      <div className="flex flex-col gap-3">
        <Card className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Brief
              </span>
            </div>
            <span className="text-[10.5px] text-muted-foreground">⌘+Enter to compose</span>
          </div>
          <Textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            onKeyDown={onKey}
            placeholder="Tell Signal what to write about.&#10;&#10;Examples:&#10;• ANC just signed the Hornets — multi-year deal for their new performance center, all LED integration ours.&#10;• Walk-off home run last night at Yankee Stadium, our ribbon LEDs caught the moment — celebrate the partnership.&#10;• Internal update: ship the SBJ partnership news for the May newsletter."
            rows={10}
            className="rounded-none border-0 px-4 py-3 text-[13px] leading-relaxed focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {CHANNELS.map((c) => (
                <ChannelPill
                  key={c.key}
                  active={selected.has(c.key)}
                  icon={c.icon}
                  label={c.label}
                  onClick={() => toggle(c.key)}
                />
              ))}
            </div>
            <Button onClick={runAll} disabled={!brief.trim() || running} size="default">
              {running ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {running ? 'Composing' : 'Compose'}
            </Button>
          </div>
        </Card>

        <div className="rounded-md border border-border bg-card/40 p-3 text-[11.5px] leading-relaxed text-muted-foreground">
          <span className="text-foreground/80">How this works.</span> Signal writes in ANC's voice — terse,
          sports-native, lead with the moment not the LED. Picks the right shape per channel automatically.
          Approval flow lands in Slack DMs to Jerry / Kirsten / Joe / Jireh / John before anything goes live.
        </div>
      </div>

      {/* RIGHT — generations */}
      <div className="flex flex-col gap-3">
        {CHANNELS.filter((c) => selected.has(c.key)).map((c) => {
          const g = generations[c.key]
          return (
            <Card key={c.key} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center text-muted-foreground">{c.icon}</span>
                  <span className="text-[12.5px] font-semibold">{c.label}</span>
                  <span className="text-[10.5px] text-muted-foreground">{c.hint}</span>
                </div>
                <div className="flex items-center gap-1">
                  {g.status === 'streaming' && <Loader2 className="size-3 animate-spin text-muted-foreground" />}
                  {g.status === 'done' && <Check className="size-3 text-emerald-500" />}
                  {g.status !== 'idle' && (
                    <button
                      onClick={() => reset(c.key)}
                      className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
                      title="Reset"
                    >
                      <RotateCcw className="size-3" />
                    </button>
                  )}
                </div>
              </div>
              <div
                className={cn(
                  'px-4 py-3 text-[13px] leading-relaxed min-h-[120px] whitespace-pre-wrap',
                  g.text ? '' : 'text-muted-foreground/50',
                )}
              >
                {g.text || (g.status === 'streaming' ? <span className="signal-pulse">·</span> : <em>Empty. Write a brief and compose.</em>)}
              </div>
              {g.status === 'done' && g.text && (
                <div className="flex items-center justify-between border-t border-border px-3 py-2 text-[11px]">
                  <span className="text-muted-foreground">{g.text.length} chars · {g.text.split(/\s+/).filter(Boolean).length} words</span>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => navigator.clipboard.writeText(g.text)}>Copy</Button>
                    <Button size="sm" variant="outline">Send for review</Button>
                  </div>
                </div>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
