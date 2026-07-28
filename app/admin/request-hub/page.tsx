'use client'

// Request Hub — admin configuration. Everything about the intake is editable
// here: types & questions, statuses, rubric, routing, roles, Slack mappings,
// notification rules, and integration flags. Each section saves its own
// config key via PUT /api/request-hub/admin/config.

import { useCallback, useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'
import { useToast } from '@/components/toast'

function SectionCard({
  title,
  subtitle,
  onSave,
  onReset,
  dirty,
  children,
}: {
  title: string
  subtitle?: string
  onSave: () => void
  onReset: () => void
  dirty: boolean
  children: React.ReactNode
}) {
  return (
    <div className="rounded-md border border-[#E8E8E8] bg-white">
      <div className="flex items-center justify-between border-b border-[#E8E8E8] px-4 py-2.5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">{title}</div>
          {subtitle ? <div className="text-xs text-zinc-400 mt-0.5">{subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onReset} className="text-[11px] text-zinc-400 hover:text-zinc-600">
            Reset to default
          </button>
          <button
            onClick={onSave}
            disabled={!dirty}
            className="h-8 px-3 bg-zinc-900 text-white text-xs font-semibold rounded hover:bg-zinc-800 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

const inputCls =
  'w-full h-9 rounded-md border border-[#E8E8E8] px-3 text-sm outline-none focus:border-[#0A52EF] bg-white'

export default function RequestHubAdminPage() {
  const { isAdmin, loaded } = useAuth('admin')
  const { showToast } = useToast()
  const [config, setConfig] = useState<any>(null)
  const [defaults, setDefaults] = useState<any>(null)
  const [overrides, setOverrides] = useState<any[]>([])
  const [staff, setStaff] = useState<any[]>([])
  const [integrations, setIntegrations] = useState<any[]>([])
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const [openType, setOpenType] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [cfgRes, metaRes, intRes] = await Promise.all([
      fetch('/api/request-hub/admin/config').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/request-hub/meta').then((r) => (r.ok ? r.json() : null)),
      fetch('/api/request-hub/admin/integrations').then((r) => (r.ok ? r.json() : null)),
    ])
    if (cfgRes) {
      setConfig(cfgRes.config)
      setDefaults(cfgRes.defaults)
      setOverrides(cfgRes.overrides || [])
    }
    if (metaRes) setStaff(metaRes.staff || [])
    if (intRes) setIntegrations(intRes.integrations || [])
  }, [])

  useEffect(() => {
    if (loaded && isAdmin) load()
  }, [loaded, isAdmin, load])

  const mutate = (key: string, value: any) => {
    setConfig((prev: any) => ({ ...prev, [key]: value }))
    setDirty((prev) => ({ ...prev, [key]: true }))
  }

  const save = async (key: string) => {
    const res = await fetch('/api/request-hub/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: config[key] }),
    })
    if (res.ok) {
      setDirty((prev) => ({ ...prev, [key]: false }))
      showToast('Saved', 'success')
      load()
    } else {
      showToast('Save failed', 'error')
    }
  }

  const reset = async (key: string) => {
    if (!confirm('Reset this section to its default configuration?')) return
    const res = await fetch('/api/request-hub/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value: null }),
    })
    if (res.ok) {
      showToast('Reset', 'success')
      setDirty((prev) => ({ ...prev, [key]: false }))
      load()
    }
  }

  if (loaded && !isAdmin) {
    return (
      <DashboardLayout>
        <div className="p-8 text-sm text-zinc-500">Admin only.</div>
      </DashboardLayout>
    )
  }
  if (!config) {
    return (
      <DashboardLayout>
        <div className="p-8 text-sm text-zinc-400">Loading configuration…</div>
      </DashboardLayout>
    )
  }

  const staffToggle = (listKey: 'approvers' | 'assessors' | 'builders') => (
    <div className="flex flex-wrap gap-1.5">
      {staff.map((s) => {
        const active = (config.roles?.[listKey] || []).includes(s.id)
        return (
          <button
            key={s.id}
            onClick={() => {
              const cur: string[] = config.roles?.[listKey] || []
              const next = active ? cur.filter((id) => id !== s.id) : [...cur, s.id]
              mutate('roles', { ...config.roles, [listKey]: next })
            }}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              active
                ? 'border-[#0A52EF] bg-[#0A52EF]/8 font-semibold text-[#0A52EF]'
                : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300'
            }`}
          >
            {s.full_name}
          </button>
        )
      })}
    </div>
  )

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-4xl space-y-6 p-2 lg:p-0">
        <div>
          <h1 className="text-lg font-semibold text-zinc-950">Request Hub configuration</h1>
          <p className="mt-1 text-sm text-zinc-500">
            The intake is not hard-coded — types, questions, workflow, rubric, routing, and Slack behavior
            all live here. Changes apply immediately.
          </p>
        </div>

        {/* Types & questions */}
        <SectionCard
          title="Request types & questions"
          subtitle="What people can submit, and what each type asks."
          onSave={() => save('types')}
          onReset={() => reset('types')}
          dirty={!!dirty.types}
        >
          <div className="space-y-3">
            {(config.types || []).map((t: any, ti: number) => (
              <div key={t.key} className="rounded-md border border-zinc-200">
                <button
                  onClick={() => setOpenType(openType === t.key ? null : t.key)}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                >
                  <div>
                    <span className="text-sm font-medium text-zinc-900">{t.label}</span>
                    <span className="ml-2 text-xs text-zinc-400">{t.questions.length} questions</span>
                  </div>
                  <span className="text-zinc-400 text-xs">{openType === t.key ? '▲' : '▼'}</span>
                </button>
                {openType === t.key ? (
                  <div className="border-t border-zinc-100 p-3 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 mb-1">Label</label>
                        <input
                          value={t.label}
                          onChange={(e) => {
                            const types = [...config.types]
                            types[ti] = { ...t, label: e.target.value }
                            mutate('types', types)
                          }}
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-zinc-600 mb-1">Description</label>
                        <input
                          value={t.description}
                          onChange={(e) => {
                            const types = [...config.types]
                            types[ti] = { ...t, description: e.target.value }
                            mutate('types', types)
                          }}
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      {t.questions.map((q: any, qi: number) => (
                        <div key={qi} className="rounded border border-zinc-100 bg-zinc-50/60 p-2.5 space-y-2">
                          <div className="flex items-center gap-2">
                            <input
                              value={q.label}
                              onChange={(e) => {
                                const types = [...config.types]
                                const qs = [...t.questions]
                                qs[qi] = { ...q, label: e.target.value }
                                types[ti] = { ...t, questions: qs }
                                mutate('types', types)
                              }}
                              className="flex-1 h-8 rounded-md border border-zinc-200 px-2 text-sm bg-white outline-none focus:border-[#0A52EF]"
                            />
                            <select
                              value={q.input}
                              onChange={(e) => {
                                const types = [...config.types]
                                const qs = [...t.questions]
                                qs[qi] = { ...q, input: e.target.value }
                                types[ti] = { ...t, questions: qs }
                                mutate('types', types)
                              }}
                              className="h-8 rounded-md border border-zinc-200 px-1.5 text-xs bg-white outline-none"
                            >
                              <option value="text">Short text</option>
                              <option value="textarea">Long text</option>
                              <option value="date">Date</option>
                              <option value="select">Choice</option>
                            </select>
                            <label className="flex items-center gap-1 text-xs text-zinc-500 whitespace-nowrap">
                              <input
                                type="checkbox"
                                checked={!!q.required}
                                onChange={(e) => {
                                  const types = [...config.types]
                                  const qs = [...t.questions]
                                  qs[qi] = { ...q, required: e.target.checked }
                                  types[ti] = { ...t, questions: qs }
                                  mutate('types', types)
                                }}
                              />
                              required
                            </label>
                            <button
                              onClick={() => {
                                const types = [...config.types]
                                types[ti] = { ...t, questions: t.questions.filter((_: any, i: number) => i !== qi) }
                                mutate('types', types)
                              }}
                              className="text-zinc-300 hover:text-red-500 text-xs px-1"
                              title="Remove question"
                            >
                              ✕
                            </button>
                          </div>
                          <div className="flex gap-2">
                            <input
                              value={q.help || ''}
                              placeholder="Helper text (optional)"
                              onChange={(e) => {
                                const types = [...config.types]
                                const qs = [...t.questions]
                                qs[qi] = { ...q, help: e.target.value }
                                types[ti] = { ...t, questions: qs }
                                mutate('types', types)
                              }}
                              className="flex-1 h-8 rounded-md border border-zinc-200 px-2 text-xs bg-white outline-none focus:border-[#0A52EF]"
                            />
                            {q.input === 'select' ? (
                              <input
                                value={(q.options || []).join(', ')}
                                placeholder="Options, comma-separated"
                                onChange={(e) => {
                                  const types = [...config.types]
                                  const qs = [...t.questions]
                                  qs[qi] = { ...q, options: e.target.value.split(',').map((o) => o.trim()).filter(Boolean) }
                                  types[ti] = { ...t, questions: qs }
                                  mutate('types', types)
                                }}
                                className="flex-1 h-8 rounded-md border border-zinc-200 px-2 text-xs bg-white outline-none focus:border-[#0A52EF]"
                              />
                            ) : null}
                            {q.showIf ? (
                              <span className="text-[10px] text-zinc-400 self-center whitespace-nowrap" title={JSON.stringify(q.showIf)}>
                                conditional on “{q.showIf.key}”
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          const types = [...config.types]
                          types[ti] = {
                            ...t,
                            questions: [
                              ...t.questions,
                              { key: `custom_${Date.now()}`, label: 'New question', input: 'text' },
                            ],
                          }
                          mutate('types', types)
                        }}
                        className="text-xs font-medium text-[#0A52EF] hover:underline"
                      >
                        + Add question
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Statuses */}
        <SectionCard
          title="Workflow statuses"
          subtitle="Stage labels shown everywhere. Keys are fixed so history stays consistent."
          onSave={() => save('statuses')}
          onReset={() => reset('statuses')}
          dirty={!!dirty.statuses}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(config.statuses || []).map((s: any, si: number) => (
              <div key={s.key} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${s.accent} shrink-0`} />
                <span className="text-[11px] text-zinc-400 w-36 shrink-0 font-mono">{s.key}</span>
                <input
                  value={s.label}
                  onChange={(e) => {
                    const statuses = [...config.statuses]
                    statuses[si] = { ...s, label: e.target.value }
                    mutate('statuses', statuses)
                  }}
                  className="flex-1 h-8 rounded-md border border-[#E8E8E8] px-2 text-sm outline-none focus:border-[#0A52EF]"
                />
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Rubric */}
        <SectionCard
          title="Assessment rubric"
          subtitle="Plain-English definitions behind every rating — no mystery scores."
          onSave={() => save('rubric')}
          onReset={() => reset('rubric')}
          dirty={!!dirty.rubric}
        >
          <div className="space-y-4">
            {(['feasibility', 'effort', 'businessValue', 'confidence'] as const).map((dim) => (
              <div key={dim}>
                <div className="text-xs font-semibold text-zinc-600 capitalize mb-1.5">
                  {dim === 'businessValue' ? 'Business value' : dim}
                </div>
                <div className="space-y-1.5">
                  {(config.rubric?.[dim] || []).map((l: any, li: number) => (
                    <div key={l.key} className="flex items-center gap-2">
                      <input
                        value={l.label}
                        onChange={(e) => {
                          const rubric = { ...config.rubric }
                          const levels = [...rubric[dim]]
                          levels[li] = { ...l, label: e.target.value }
                          rubric[dim] = levels
                          mutate('rubric', rubric)
                        }}
                        className="w-48 h-8 rounded-md border border-[#E8E8E8] px-2 text-sm outline-none focus:border-[#0A52EF]"
                      />
                      <input
                        value={l.description}
                        onChange={(e) => {
                          const rubric = { ...config.rubric }
                          const levels = [...rubric[dim]]
                          levels[li] = { ...l, description: e.target.value }
                          rubric[dim] = levels
                          mutate('rubric', rubric)
                        }}
                        className="flex-1 h-8 rounded-md border border-[#E8E8E8] px-2 text-xs outline-none focus:border-[#0A52EF]"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Roles */}
        <SectionCard
          title="Roles"
          subtitle="Admins always qualify. Managers and above assess by default; approvers decide."
          onSave={() => save('roles')}
          onReset={() => reset('roles')}
          dirty={!!dirty.roles}
        >
          <div className="space-y-4">
            <div>
              <div className="text-xs font-medium text-zinc-600 mb-1.5">Leadership approvers</div>
              {staffToggle('approvers')}
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-600 mb-1.5">Additional assessors</div>
              {staffToggle('assessors')}
            </div>
            <div>
              <div className="text-xs font-medium text-zinc-600 mb-1.5">Builders</div>
              {staffToggle('builders')}
            </div>
          </div>
        </SectionCard>

        {/* Routing */}
        <SectionCard
          title="Routing"
          subtitle="Who owns new requests when they arrive."
          onSave={() => save('routing')}
          onReset={() => reset('routing')}
          dirty={!!dirty.routing}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Default owner</label>
              <select
                value={config.routing?.defaultOwnerId || ''}
                onChange={(e) => mutate('routing', { ...config.routing, defaultOwnerId: e.target.value || null })}
                className={inputCls}
              >
                <option value="">Unassigned (manual routing)</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
            {(config.types || []).map((t: any) => (
              <div key={t.key}>
                <label className="block text-xs font-medium text-zinc-600 mb-1">Owner for “{t.label}”</label>
                <select
                  value={config.routing?.typeOwners?.[t.key] || ''}
                  onChange={(e) =>
                    mutate('routing', {
                      ...config.routing,
                      typeOwners: { ...config.routing?.typeOwners, [t.key]: e.target.value || undefined },
                    })
                  }
                  className={inputCls}
                >
                  <option value="">Use default</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Slack */}
        <SectionCard
          title="Slack"
          subtitle="Channel mappings and Slack-side behavior."
          onSave={() => save('slack')}
          onReset={() => reset('slack')}
          dirty={!!dirty.slack}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Leadership channel ID</label>
              <input
                value={config.slack?.leadershipChannelId || ''}
                onChange={(e) => mutate('slack', { ...config.slack, leadershipChannelId: e.target.value.trim() })}
                placeholder="C0123456789"
                className={inputCls}
              />
              <p className="text-[11px] text-zinc-400 mt-1">New-request decision cards post here.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600 mb-1">Intake channel ID (fallback)</label>
              <input
                value={config.slack?.intakeChannelId || ''}
                onChange={(e) => mutate('slack', { ...config.slack, intakeChannelId: e.target.value.trim() })}
                placeholder="C0123456789"
                className={inputCls}
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!config.slack?.postOnSubmit}
                onChange={(e) => mutate('slack', { ...config.slack, postOnSubmit: e.target.checked })}
              />
              Post a card when a request is submitted
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={!!config.slack?.dmRequester}
                onChange={(e) => mutate('slack', { ...config.slack, dmRequester: e.target.checked })}
              />
              DM the requester a confirmation card
            </label>
          </div>
        </SectionCard>

        {/* Notifications */}
        <SectionCard
          title="Notification rules"
          subtitle="Quiet by design — only the affected people, only when it matters."
          onSave={() => save('notifications')}
          onReset={() => reset('notifications')}
          dirty={!!dirty.notifications}
        >
          <div className="space-y-2">
            {(
              [
                ['notifyOwnerOnAssign', 'DM the new owner when a request is assigned'],
                ['notifyRequesterOnDecision', 'DM the requester when leadership decides'],
                ['notifyRequesterOnComplete', 'DM the requester when work completes'],
                ['notifyThreadOnStatus', 'Post status changes as a threaded reply on the intake card'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-zinc-700">
                <input
                  type="checkbox"
                  checked={!!config.notifications?.[key]}
                  onChange={(e) => mutate('notifications', { ...config.notifications, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
            <div className="pt-2">
              <label className="block text-xs font-medium text-zinc-600 mb-1">Expected response time (shown to requesters)</label>
              <input
                value={config.responseTimeText || ''}
                onChange={(e) => mutate('responseTimeText', e.target.value)}
                className={inputCls}
              />
              <button
                onClick={() => save('responseTimeText')}
                disabled={!dirty.responseTimeText}
                className="mt-2 h-8 px-3 bg-zinc-900 text-white text-xs font-semibold rounded hover:bg-zinc-800 disabled:opacity-40"
              >
                Save response time
              </button>
            </div>
          </div>
        </SectionCard>

        {/* Integrations */}
        <SectionCard
          title="Integrations"
          subtitle="Honest status — an adapter shows as connected only when its credentials are actually present."
          onSave={() => save('integrations')}
          onReset={() => reset('integrations')}
          dirty={!!dirty.integrations}
        >
          <div className="space-y-2.5">
            {integrations.map((i) => (
              <div key={i.key} className="flex items-center gap-3 rounded-md border border-zinc-100 px-3 py-2.5">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${i.configured ? 'bg-emerald-500' : 'bg-zinc-300'}`}
                  title={i.configured ? 'Credentials present' : 'Not configured'}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-900">{i.label}</div>
                  <div className="text-xs text-zinc-500">{i.description}</div>
                  {!i.configured ? (
                    <div className="text-[11px] text-zinc-400 mt-0.5">
                      Needs env: <span className="font-mono">{i.envVars.join(', ')}</span>
                    </div>
                  ) : null}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-zinc-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={!!config.integrations?.[i.key]?.enabled}
                    onChange={(e) =>
                      mutate('integrations', {
                        ...config.integrations,
                        [i.key]: { ...config.integrations?.[i.key], enabled: e.target.checked },
                      })
                    }
                  />
                  enabled
                </label>
                <label className="flex items-center gap-1.5 text-xs text-zinc-600 whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={!!config.integrations?.[i.key]?.testMode}
                    onChange={(e) =>
                      mutate('integrations', {
                        ...config.integrations,
                        [i.key]: { ...config.integrations?.[i.key], testMode: e.target.checked },
                      })
                    }
                  />
                  test mode
                </label>
              </div>
            ))}
          </div>
        </SectionCard>

        {/* Config change audit */}
        <div className="rounded-md border border-[#E8E8E8] bg-white">
          <div className="border-b border-[#E8E8E8] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            Configuration changes
          </div>
          <ul className="divide-y divide-[#F4F4F4]">
            {overrides.length === 0 ? (
              <li className="px-4 py-3 text-xs text-zinc-400">All sections are on defaults.</li>
            ) : (
              overrides.map((o) => (
                <li key={o.key} className="px-4 py-2.5 text-xs text-zinc-500">
                  <span className="font-mono text-zinc-700">{o.key}</span> — last changed
                  {o.updated_by_name ? ` by ${o.updated_by_name}` : ''} on{' '}
                  {new Date(o.updated_at).toLocaleString()}
                </li>
              ))
            )}
          </ul>
        </div>
      </div>
    </DashboardLayout>
  )
}
