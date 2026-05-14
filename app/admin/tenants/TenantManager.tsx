'use client'

import { useCallback, useEffect, useState } from 'react'

interface Tenant {
  id: string
  slug: string
  subdomain: string
  name: string
  brand_name: string | null
  logo_url: string | null
  primary_color: string | null
  retainer_cap_hours: number
  hourly_rate_usd: number
  monthly_retainer_usd: number
  warranty_days: number
  payoneer_pending_url: string | null
  payoneer_topup_url: string | null
  contract_summary: string | null
  is_active: boolean
  features: Record<string, boolean>
  page_maintenance: Record<string, boolean>
}

const FEATURE_LABELS: Record<string, string> = {
  transparency: 'Transparency',
  change_orders: 'Change Orders',
  explore: 'Explore',
  morning_brief: 'Morning Brief',
  service_log: 'Service Log',
  expenses: 'Expenses',
  advisor: 'Advisor',
}

interface NewForm {
  slug: string
  subdomain: string
  name: string
  brand_name: string
  retainer_cap_hours: string
  hourly_rate_usd: string
  monthly_retainer_usd: string
  warranty_days: string
}

const EMPTY_NEW: NewForm = {
  slug: '',
  subdomain: '',
  name: '',
  brand_name: '',
  retainer_cap_hours: '12',
  hourly_rate_usd: '90',
  monthly_retainer_usd: '1500',
  warranty_days: '30',
}

export default function TenantManager() {
  const [tenants, setTenants] = useState<Tenant[] | null>(null)
  const [featureKeys, setFeatureKeys] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newForm, setNewForm] = useState<NewForm>(EMPTY_NEW)
  const [edits, setEdits] = useState<Record<string, Partial<Tenant>>>({})
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/tenants', { cache: 'no-store' })
      if (res.status === 401 || res.status === 403) {
        setError('Admin only.')
        setTenants([])
        return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setTenants(json.tenants || [])
      setFeatureKeys(json.feature_keys || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'failed to load')
      setTenants([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function createTenant() {
    if (!newForm.slug || !newForm.name) {
      setError('Slug and name are required.')
      return
    }
    const body = {
      slug: newForm.slug,
      subdomain: newForm.subdomain || newForm.slug,
      name: newForm.name,
      brand_name: newForm.brand_name || newForm.name,
      retainer_cap_hours: newForm.retainer_cap_hours ? Number(newForm.retainer_cap_hours) : 12,
      hourly_rate_usd: newForm.hourly_rate_usd ? Number(newForm.hourly_rate_usd) : 90,
      monthly_retainer_usd: newForm.monthly_retainer_usd ? Number(newForm.monthly_retainer_usd) : 1500,
      warranty_days: newForm.warranty_days ? Number(newForm.warranty_days) : 30,
    }
    const res = await fetch('/api/admin/tenants', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(`Create failed: ${j.error || res.status}`)
      return
    }
    setNewForm(EMPTY_NEW)
    setCreating(false)
    await load()
  }

  function setEdit(id: string, patch: Partial<Tenant>) {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), ...patch } }))
  }

  async function saveEdit(t: Tenant) {
    const patch = edits[t.id]
    if (!patch || Object.keys(patch).length === 0) {
      setExpandedId(null)
      return
    }
    const res = await fetch(`/api/admin/tenants/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(`Save failed: ${j.error || res.status}`)
      return
    }
    setEdits((prev) => {
      const next = { ...prev }
      delete next[t.id]
      return next
    })
    await load()
  }

  async function toggleFeature(t: Tenant, key: string, enabled: boolean) {
    const res = await fetch(`/api/admin/tenants/${t.id}/features`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_key: key, enabled }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(`Toggle failed: ${j.error || res.status}`)
      return
    }
    setTenants((prev) => {
      if (!prev) return prev
      return prev.map((x) =>
        x.id === t.id ? { ...x, features: { ...x.features, [key]: enabled } } : x,
      )
    })
  }

  async function toggleMaintenance(t: Tenant, key: string, underMaintenance: boolean) {
    const res = await fetch(`/api/admin/tenants/${t.id}/maintenance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature_key: key, under_maintenance: underMaintenance }),
    })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(`Maintenance toggle failed: ${j.error || res.status}`)
      return
    }
    setTenants((prev) => {
      if (!prev) return prev
      return prev.map((x) =>
        x.id === t.id ? { ...x, page_maintenance: { ...x.page_maintenance, [key]: underMaintenance } } : x,
      )
    })
  }

  async function archive(t: Tenant) {
    if (!confirm(`Archive ${t.name}? It will stop appearing on its subdomain.`)) return
    const res = await fetch(`/api/admin/tenants/${t.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setError(`Archive failed: ${j.error || res.status}`)
      return
    }
    await load()
  }

  return (
    <div className="space-y-4">
      {error ? (
        <div className="text-xs text-rose-700 dark:text-rose-300 px-3 py-2 bg-rose-50 dark:bg-rose-950 rounded border border-rose-200 dark:border-rose-900">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {tenants ? `${tenants.length} tenant${tenants.length === 1 ? '' : 's'}` : 'Loading…'}
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className="text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold"
        >
          {creating ? 'Cancel' : '+ New tenant'}
        </button>
      </div>

      {creating ? (
        <div className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50/40 dark:bg-blue-950/20 p-5">
          <h2 className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-3">New tenant</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Slug (used in URLs)" value={newForm.slug} onChange={(v) => setNewForm({ ...newForm, slug: v })} placeholder="acme" />
            <Field label="Subdomain" value={newForm.subdomain} onChange={(v) => setNewForm({ ...newForm, subdomain: v })} placeholder="acme (defaults to slug)" />
            <Field label="Full name" value={newForm.name} onChange={(v) => setNewForm({ ...newForm, name: v })} placeholder="Acme Sports Inc" />
            <Field label="Brand name (shown on dashboard)" value={newForm.brand_name} onChange={(v) => setNewForm({ ...newForm, brand_name: v })} placeholder="Acme" />
            <Field label="Retainer cap (hours)" value={newForm.retainer_cap_hours} onChange={(v) => setNewForm({ ...newForm, retainer_cap_hours: v })} placeholder="12" />
            <Field label="Hourly rate (USD)" value={newForm.hourly_rate_usd} onChange={(v) => setNewForm({ ...newForm, hourly_rate_usd: v })} placeholder="90" />
            <Field label="Monthly retainer (USD)" value={newForm.monthly_retainer_usd} onChange={(v) => setNewForm({ ...newForm, monthly_retainer_usd: v })} placeholder="1500" />
            <Field label="Warranty (days)" value={newForm.warranty_days} onChange={(v) => setNewForm({ ...newForm, warranty_days: v })} placeholder="30" />
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => { setCreating(false); setNewForm(EMPTY_NEW) }} className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700">Cancel</button>
            <button onClick={createTenant} className="text-xs px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold">Create tenant</button>
          </div>
        </div>
      ) : null}

      {tenants === null ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">Loading…</div>
      ) : tenants.length === 0 ? (
        <div className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">No tenants yet.</div>
      ) : (
        <div className="space-y-3">
          {tenants.map((t) => {
            const isOpen = expandedId === t.id
            const patch = edits[t.id] || {}
            const v = (k: keyof Tenant) => (patch[k] !== undefined ? patch[k] : t[k])
            return (
              <div key={t.id} className={`rounded-2xl border ${t.is_active ? 'border-gray-200 dark:border-gray-800' : 'border-amber-200 dark:border-amber-900 bg-amber-50/30 dark:bg-amber-950/20'} bg-white dark:bg-gray-900 shadow-sm overflow-hidden`}>
                <button onClick={() => setExpandedId(isOpen ? null : t.id)} className="w-full flex items-start justify-between gap-4 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <div className="min-w-0">
                    <div className="text-base font-semibold">{t.brand_name || t.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      slug: {t.slug} · subdomain: {t.subdomain} · {t.retainer_cap_hours}h/mo at ${t.hourly_rate_usd}/hr · ${(t.monthly_retainer_usd).toLocaleString('en-US')}/mo · {t.warranty_days}d warranty
                    </div>
                  </div>
                  <span className="text-xs text-gray-400">{isOpen ? '▴' : '▾'}</span>
                </button>

                {isOpen ? (
                  <div className="p-4 border-t border-gray-100 dark:border-gray-800 space-y-5">
                    {/* Features + maintenance locks — one row per page,
                        feature toggle on the left, maintenance lock on the right. */}
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-2">Features &amp; maintenance</div>
                      <div className="border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
                        {featureKeys.map((k) => {
                          const enabled = !!t.features[k]
                          const maint = !!t.page_maintenance?.[k]
                          return (
                            <div key={k} className="flex items-center justify-between gap-3 px-3 py-2 bg-white dark:bg-gray-950/40">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0">
                                {FEATURE_LABELS[k] || k}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => toggleFeature(t, k, !enabled)}
                                  className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold ${enabled ? 'bg-emerald-600 text-white border-emerald-700' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'}`}
                                  title={enabled ? 'Enabled — tenant sees this page' : 'Disabled — tenant cannot access this page'}
                                >
                                  {enabled ? '✓ Enabled' : '○ Disabled'}
                                </button>
                                <button
                                  onClick={() => toggleMaintenance(t, k, !maint)}
                                  className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold ${maint ? 'bg-amber-500 text-white border-amber-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-500 border-gray-300 dark:border-gray-700'}`}
                                  title={maint ? 'Locked — non-admin viewers see a maintenance card' : 'Live — visitors see the normal page'}
                                >
                                  {maint ? '🛠️ Maintenance' : '🔓 Live'}
                                </button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div className="text-[10px] text-gray-500 dark:text-gray-500 mt-1.5">
                        <strong>Enabled</strong> = tenant has access. <strong>Maintenance</strong> = the page is temporarily locked behind a “back soon” card for non-admins; admins still see the live page.
                      </div>
                    </div>

                    {/* Retainer config */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Field label="Brand name" value={String(v('brand_name') ?? '')} onChange={(val) => setEdit(t.id, { brand_name: val })} />
                      <Field label="Subdomain" value={String(v('subdomain') ?? '')} onChange={(val) => setEdit(t.id, { subdomain: val })} />
                      <Field label="Retainer cap (hours)" value={String(v('retainer_cap_hours') ?? '')} onChange={(val) => setEdit(t.id, { retainer_cap_hours: Number(val) })} />
                      <Field label="Hourly rate (USD)" value={String(v('hourly_rate_usd') ?? '')} onChange={(val) => setEdit(t.id, { hourly_rate_usd: Number(val) })} />
                      <Field label="Monthly retainer (USD)" value={String(v('monthly_retainer_usd') ?? '')} onChange={(val) => setEdit(t.id, { monthly_retainer_usd: Number(val) })} />
                      <Field label="Warranty (days)" value={String(v('warranty_days') ?? '')} onChange={(val) => setEdit(t.id, { warranty_days: Number(val) })} />
                      <Field label="Payoneer pending URL" value={String(v('payoneer_pending_url') ?? '')} onChange={(val) => setEdit(t.id, { payoneer_pending_url: val })} />
                      <Field label="Payoneer top-up URL" value={String(v('payoneer_topup_url') ?? '')} onChange={(val) => setEdit(t.id, { payoneer_topup_url: val })} />
                    </div>

                    <div>
                      <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1 block">Contract summary (footer)</label>
                      <textarea
                        value={String(v('contract_summary') ?? '')}
                        onChange={(e) => setEdit(t.id, { contract_summary: e.target.value })}
                        rows={2}
                        className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950"
                      />
                    </div>

                    <div className="flex justify-between items-center pt-3 border-t border-gray-100 dark:border-gray-800">
                      <button onClick={() => archive(t)} className="text-xs px-3 py-1.5 rounded border border-rose-300 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950" disabled={t.slug === 'anc'}>
                        {t.slug === 'anc' ? 'Cannot archive ANC' : 'Archive'}
                      </button>
                      <div className="flex gap-2">
                        <button onClick={() => { setEdits((p) => { const n = { ...p }; delete n[t.id]; return n }); setExpandedId(null) }} className="text-xs px-3 py-1.5 rounded border border-gray-300 dark:border-gray-700">Close</button>
                        <button onClick={() => saveEdit(t)} className="text-xs px-4 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700 font-semibold">Save changes</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 mb-1 block">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm px-3 py-2 rounded border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-950"
      />
    </div>
  )
}
