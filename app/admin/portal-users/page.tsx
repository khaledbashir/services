'use client'

import { useCallback, useEffect, useState } from 'react'

interface PortalUser {
  id: string
  email: string
  full_name: string
  client_id: string | null
  client_name: string | null
  is_active: boolean
  has_password: boolean
  invite_token: string | null
  last_login_at: string | null
  created_at: string
  venue_count: number
}

interface ClientOption { id: string; name: string }

export default function PortalUsersAdminPage() {
  const [users, setUsers] = useState<PortalUser[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [clientId, setClientId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [usersRes, clientsRes] = await Promise.all([
        fetch('/api/customer-users'),
        fetch('/api/clients'),
      ])
      if (usersRes.ok) setUsers((await usersRes.json()).users || [])
      if (clientsRes.ok) {
        const data = await clientsRes.json()
        setClients((data.clients || data || []).map((c: any) => ({ id: c.id, name: c.name })))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const res = await fetch('/api/customer-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, full_name: fullName, client_id: clientId || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'Could not create user'); return }
      setInviteUrl(data.invite_url)
      setEmail(''); setFullName(''); setClientId('')
      load()
    } finally {
      setSubmitting(false)
    }
  }

  async function toggleActive(user: PortalUser) {
    await fetch('/api/customer-users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    })
    load()
  }

  function copyInvite(user: PortalUser) {
    if (!user.invite_token) return
    const url = `${window.location.origin}/customer/invite/${user.invite_token}`
    navigator.clipboard.writeText(url)
    setCopied(user.id)
    setTimeout(() => setCopied(''), 2000)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Customer Portal Users</h1>
          <p className="text-sm text-slate-500 mt-1">
            Accounts for the client-facing portal at <span className="font-mono">/customer</span>. Users see tickets for every venue linked to their organization.
          </p>
        </div>
        <button
          onClick={() => { setShowNew(true); setInviteUrl('') }}
          className="rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition"
        >
          + Invite customer
        </button>
      </div>

      {showNew && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          {inviteUrl ? (
            <div>
              <div className="text-sm font-medium text-green-700 mb-2">✓ Invite created — send this link to the customer:</div>
              <div className="flex gap-2">
                <input readOnly value={inviteUrl} className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono bg-slate-50" />
                <button
                  onClick={() => { navigator.clipboard.writeText(inviteUrl); setCopied('new'); setTimeout(() => setCopied(''), 2000) }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50 transition"
                >
                  {copied === 'new' ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
              <button onClick={() => { setShowNew(false); setInviteUrl('') }} className="text-sm text-slate-500 mt-3 hover:text-slate-700">Close</button>
            </div>
          ) : (
            <form onSubmit={createUser} className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Full name</label>
                <input value={fullName} onChange={e => setFullName(e.target.value)} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="jane@team.com" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Organization</label>
                <select value={clientId} onChange={e => setClientId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">— none yet —</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <button type="submit" disabled={submitting}
                  className="rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 transition">
                  {submitting ? 'Creating…' : 'Create invite'}
                </button>
                <button type="button" onClick={() => setShowNew(false)} className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 transition">Cancel</button>
              </div>
              {error && <div className="sm:col-span-4 text-sm text-red-600">{error}</div>}
            </form>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Organization</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No customer accounts yet.</td></tr>
            ) : users.map(u => (
              <tr key={u.id} className={u.is_active ? '' : 'opacity-50'}>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-900">{u.full_name}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="text-slate-700">{u.client_name || '—'}</div>
                  {u.venue_count > 0 && <div className="text-xs text-slate-400">{u.venue_count} venue{u.venue_count === 1 ? '' : 's'}</div>}
                </td>
                <td className="px-4 py-3">
                  {!u.is_active ? (
                    <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">Deactivated</span>
                  ) : u.has_password ? (
                    <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-700">Active</span>
                  ) : (
                    <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-700">Invite pending</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500 text-xs">
                  {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                </td>
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  {u.is_active && !u.has_password && u.invite_token && (
                    <button onClick={() => copyInvite(u)} className="text-xs text-[#0A52EF] hover:underline">
                      {copied === u.id ? 'Copied ✓' : 'Copy invite link'}
                    </button>
                  )}
                  <button onClick={() => toggleActive(u)} className="text-xs text-slate-500 hover:underline">
                    {u.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
