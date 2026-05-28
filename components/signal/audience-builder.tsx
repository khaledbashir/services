'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Sparkles, Loader2, Database, AlertCircle, Check, Save } from 'lucide-react'

interface ContactRow {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  company_name?: string | null
}

const EXAMPLES = [
  'People who opened the Hornets newsletter in the last 90 days',
  'Subscribed contacts in the Media & Partnerships audience',
  'Anyone who clicked the LG/Red Sox announcement and works at a sports team',
  'Contacts in the All Newsletter Subscribed audience but NOT in Do Not Market To',
]

export function AudienceBuilder() {
  const [nlQuery, setNlQuery] = React.useState('')
  const [running, setRunning] = React.useState(false)
  const [sql, setSql] = React.useState('')
  const [rows, setRows] = React.useState<ContactRow[]>([])
  const [total, setTotal] = React.useState<number | null>(null)
  const [err, setErr] = React.useState<string>('')
  const [name, setName] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState<string>('')

  async function run() {
    if (!nlQuery.trim() || running) return
    setRunning(true); setErr(''); setRows([]); setSql(''); setTotal(null); setSaved('')
    try {
      const res = await fetch('/api/marketing/audiences/nl-query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: nlQuery }),
      })
      const data = await res.json()
      setSql(data.sql || '')
      if (data.rejected) { setErr(`Rejected: ${data.rejected}`); return }
      if (data.error) { setErr(data.detail || data.error); return }
      setRows(data.rows || []); setTotal(data.total ?? 0)
    } catch (e) { setErr(String(e)) } finally { setRunning(false) }
  }

  async function save() {
    if (!name.trim() || !sql || !rows.length || saving) return
    setSaving(true); setSaved('')
    try {
      const res = await fetch('/api/marketing/audiences/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, nlQuery, sql, contactIds: rows.map((r) => r.id) }),
      })
      const data = await res.json()
      if (!res.ok) { setErr(data.detail || data.error || 'save failed'); return }
      setSaved(`Saved audience · ${data.memberCount} members`)
      setName('')
    } catch (e) { setErr(String(e)) } finally { setSaving(false) }
  }

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-[1fr_1.4fr]">
      <div className="flex flex-col gap-3">
        <Card className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <span className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Audience query</span>
            <span className="text-[10.5px] text-muted-foreground">⌘+Enter to run</span>
          </div>
          <Textarea
            value={nlQuery}
            onChange={(e) => setNlQuery(e.target.value)}
            onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); run() } }}
            placeholder="Describe the audience in plain English. Signal turns it into safe SQL and previews who's in."
            rows={6}
            className="rounded-none border-0 px-4 py-3 text-[13px] leading-relaxed focus-visible:ring-0"
          />
          <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2">
            <span className="text-[10.5px] text-muted-foreground">Read-only SELECT against the marketing schema</span>
            <Button onClick={run} disabled={!nlQuery.trim() || running} size="default">
              {running ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              {running ? 'Querying' : 'Run'}
            </Button>
          </div>
        </Card>

        <Card className="px-4 py-3">
          <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Examples</div>
          <div className="mt-2 flex flex-col gap-1.5">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                onClick={() => setNlQuery(ex)}
                className="text-left text-[12px] text-muted-foreground rounded px-2 py-1 hover:bg-accent hover:text-foreground transition-colors"
              >
                "{ex}"
              </button>
            ))}
          </div>
        </Card>

        {sql && (
          <Card>
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <Database className="size-3.5 text-muted-foreground" />
              <span className="text-[11.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Generated SQL
              </span>
            </div>
            <pre className="signal-mono whitespace-pre-wrap break-all px-4 py-3 text-[11px] text-foreground/80">
              {sql}
            </pre>
          </Card>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <Card className="flex flex-col">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold">Preview</span>
              {total !== null && <Badge variant={total > 0 ? 'success' : 'ghost'}>{total} contacts</Badge>}
            </div>
            <div className="flex items-center gap-1">
              {err && (
                <span className="flex items-center gap-1 text-[11px] text-destructive">
                  <AlertCircle className="size-3" /> {err}
                </span>
              )}
              {!err && total === 0 && <span className="text-[11px] text-muted-foreground">no matches</span>}
            </div>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[12px] text-muted-foreground">
                Run a query to see matching contacts.
              </div>
            ) : (
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-border text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="px-4 py-2 text-left font-medium">Name</th>
                    <th className="px-4 py-2 text-left font-medium">Email</th>
                    <th className="px-4 py-2 text-left font-medium">Company</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r) => (
                    <tr key={r.id} className="border-b border-border/60">
                      <td className="px-4 py-1.5">
                        {[r.first_name, r.last_name].filter(Boolean).join(' ') || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-1.5 text-foreground/80">{r.email}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">{r.company_name || '—'}</td>
                    </tr>
                  ))}
                  {rows.length > 200 && (
                    <tr><td colSpan={3} className="px-4 py-2 text-center text-[11px] text-muted-foreground">+ {rows.length - 200} more …</td></tr>
                  )}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        {rows.length > 0 && (
          <Card className="flex items-center gap-2 p-3">
            <Input
              placeholder="Audience name (e.g. NBA Team Engaged Q2 2026)"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Button onClick={save} disabled={!name.trim() || saving}>
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
              Save audience
            </Button>
            {saved && (
              <span className={cn('ml-2 flex items-center gap-1 text-[12px] text-emerald-400')}>
                <Check className="size-3" /> {saved}
              </span>
            )}
          </Card>
        )}
      </div>
    </div>
  )
}
