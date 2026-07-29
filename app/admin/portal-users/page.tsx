'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, UserPlus } from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'

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

interface ClientOption {
  id: string
  name: string
  venue_count?: number
}

interface VenueOption {
  id: string
  name: string
  market?: string | null
  primary_contact_email?: string | null
  is_active?: boolean
}

export default function PortalUsersAdminPage() {
  // Managing portal accounts is a manager job; stepping into a customer's
  // session is admin-only, so the "View as" control is gated separately below.
  const { isAdmin } = useAuth('manager')

  const [users, setUsers] = useState<PortalUser[]>([])
  const [clients, setClients] = useState<ClientOption[]>([])
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [organizationMode, setOrganizationMode] = useState<'existing' | 'new'>('existing')
  const [organizationName, setOrganizationName] = useState('')
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([])
  const [venueSearch, setVenueSearch] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [clientId, setClientId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [customerUrl, setCustomerUrl] = useState('')
  const [copied, setCopied] = useState('')
  const [inviteSent, setInviteSent] = useState<boolean | null>(null)
  const [inviteSentEmail, setInviteSentEmail] = useState('')
  const [resent, setResent] = useState('')
  const [impersonating, setImpersonating] = useState('')
  const [viewAsError, setViewAsError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [usersRes, clientsRes, venuesRes] = await Promise.all([
        fetch('/api/customer-users'),
        fetch('/api/clients'),
        fetch('/api/venues?include_inactive=true'),
      ])
      if (usersRes.ok) setUsers((await usersRes.json()).users || [])
      if (clientsRes.ok) {
        const data = await clientsRes.json()
        setClients((data.clients || data || []).map((c: any) => ({
          id: c.id,
          name: c.name,
          venue_count: c.venue_count,
        })))
      }
      if (venuesRes.ok) {
        const data = await venuesRes.json()
        setVenues((data.venues || []).map((v: any) => ({
          id: v.id,
          name: v.name,
          market: v.market,
          primary_contact_email: v.primary_contact_email,
          is_active: v.is_active,
        })))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const filteredVenues = useMemo(() => {
    const q = venueSearch.trim().toLowerCase()
    const list = q
      ? venues.filter((venue) =>
          [venue.name, venue.market, venue.primary_contact_email]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(q))
        )
      : venues
    return list.slice(0, 80)
  }, [venueSearch, venues])

  const selectedVenueNames = useMemo(() => {
    const byId = new Map(venues.map((venue) => [venue.id, venue.name]))
    return selectedVenueIds.map((id) => byId.get(id)).filter(Boolean) as string[]
  }, [selectedVenueIds, venues])

  function resetForm() {
    setEmail('')
    setFullName('')
    setClientId('')
    setOrganizationName('')
    setSelectedVenueIds([])
    setVenueSearch('')
    setOrganizationMode('existing')
    setError('')
  }

  async function copyText(value: string, key: string) {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(key)
    setTimeout(() => setCopied(''), 2000)
  }

  function toggleVenue(venueId: string) {
    setSelectedVenueIds((current) =>
      current.includes(venueId)
        ? current.filter((id) => id !== venueId)
        : [...current, venueId]
    )
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const isNewOrg = organizationMode === 'new'
      if (!isNewOrg && !clientId) {
        setError('Choose an organization or create a new one.')
        return
      }
      if (isNewOrg && !organizationName.trim()) {
        setError('Organization name is required.')
        return
      }
      if (isNewOrg && selectedVenueIds.length === 0) {
        setError('Select at least one venue for the new organization.')
        return
      }

      const res = await fetch('/api/customer-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          full_name: fullName,
          client_id: isNewOrg ? null : clientId,
          organization_name: isNewOrg ? organizationName : null,
          linked_venue_ids: selectedVenueIds,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not create portal invite')
        return
      }

      setInviteUrl(data.invite_url)
      setCustomerUrl(data.customer_url || `${window.location.origin}/customer`)
      setInviteSent(Boolean(data.invite_sent))
      setInviteSentEmail(data.user?.email || email)
      resetForm()
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  async function resendInvite(user: PortalUser) {
    setResent(`sending:${user.id}`)
    try {
      const res = await fetch('/api/customer-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, resend_invite: true }),
      })
      const data = await res.json().catch(() => ({}))
      setResent(res.ok && data.invite_sent ? `sent:${user.id}` : `fail:${user.id}`)
    } catch {
      setResent(`fail:${user.id}`)
    }
    load()
  }

  async function viewAs(user: PortalUser) {
    setViewAsError('')
    setImpersonating(user.id)
    try {
      const res = await fetch(`/api/customer-users/${user.id}/impersonate`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setViewAsError(data.error || 'Could not open that customer view')
        setImpersonating('')
        return
      }
      window.location.href = data.customer_url || '/customer'
    } catch {
      setViewAsError('Could not open that customer view')
      setImpersonating('')
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

  function inviteFor(user: PortalUser) {
    if (!user.invite_token) return ''
    return `${window.location.origin}/customer/invite/${user.invite_token}`
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Customer Access</p>
            <h1 className="mt-1 text-2xl font-semibold text-slate-950">Customer Portal Setup</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Create the customer-facing login, attach it to an organization, and control which venues appear in <span className="font-mono">/customer</span>.
            </p>
          </div>
          <button
            onClick={() => { setShowNew(true); setInviteUrl(''); setCustomerUrl('') }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4" />
            Create Portal
          </button>
        </div>

        {showNew && (
          <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            {inviteUrl ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                  <Check className="h-4 w-4" />
                  {inviteSent
                    ? `Invite emailed to ${inviteSentEmail} — link below is a backup if they can't find it`
                    : 'Customer portal invite is ready — email delivery failed, send them the link below'}
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
                  <input readOnly value={inviteUrl} className="min-w-0 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700" />
                  <div className="flex gap-2">
                    <button
                      onClick={() => copyText(inviteUrl, 'new-invite')}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Copy className="h-4 w-4" />
                      {copied === 'new-invite' ? 'Copied' : 'Copy Invite'}
                    </button>
                    <a
                      href={customerUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Open Login
                    </a>
                  </div>
                </div>
                <button onClick={() => { setShowNew(false); setInviteUrl('') }} className="text-sm font-medium text-slate-500 hover:text-slate-800">Close</button>
              </div>
            ) : (
              <form onSubmit={createUser} className="space-y-5">
                <div className="grid gap-4 lg:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    Customer name
                    <input
                      value={fullName}
                      onChange={(event) => setFullName(event.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                      placeholder="Client Contact"
                    />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Customer email
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                      placeholder="contact@example.com"
                    />
                  </label>
                </div>

                <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
                  <div className="space-y-3">
                    <div className="text-sm font-medium text-slate-700">Organization</div>
                    <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() => setOrganizationMode('existing')}
                        className={`rounded-md px-3 py-2 text-sm font-medium transition ${organizationMode === 'existing' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        Existing
                      </button>
                      <button
                        type="button"
                        onClick={() => setOrganizationMode('new')}
                        className={`rounded-md px-3 py-2 text-sm font-medium transition ${organizationMode === 'new' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                      >
                        New
                      </button>
                    </div>

                    {organizationMode === 'existing' ? (
                      <label className="block text-sm font-medium text-slate-700">
                        Select organization
                        <select
                          value={clientId}
                          onChange={(event) => setClientId(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                        >
                          <option value="">Choose organization</option>
                          {clients.map((client) => (
                            <option key={client.id} value={client.id}>
                              {client.name}{typeof client.venue_count === 'number' ? ` · ${client.venue_count} venue${client.venue_count === 1 ? '' : 's'}` : ''}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <label className="block text-sm font-medium text-slate-700">
                        New organization name
                        <input
                          value={organizationName}
                          onChange={(event) => setOrganizationName(event.target.value)}
                          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                          placeholder="Team or venue group"
                        />
                      </label>
                    )}
                  </div>

                  <div className="rounded-lg border border-slate-200">
                    <div className="border-b border-slate-200 p-3">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="text-sm font-medium text-slate-800">
                            Venue access {organizationMode === 'existing' && <span className="font-normal text-slate-400">(optional add-on)</span>}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {selectedVenueIds.length > 0 ? selectedVenueNames.join(', ') : 'Select venues the customer can see.'}
                          </div>
                        </div>
                        <input
                          value={venueSearch}
                          onChange={(event) => setVenueSearch(event.target.value)}
                          className="h-9 rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-[#0A52EF]"
                          placeholder="Search venues"
                        />
                      </div>
                    </div>
                    <div className="max-h-64 overflow-auto p-2">
                      {filteredVenues.length === 0 ? (
                        <div className="p-6 text-center text-sm text-slate-400">No venues found.</div>
                      ) : (
                        filteredVenues.map((venue) => (
                          <label key={venue.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 text-sm hover:bg-slate-50">
                            <span className="min-w-0">
                              <span className="block truncate font-medium text-slate-800">{venue.name}</span>
                              <span className="block truncate text-xs text-slate-400">{venue.market || venue.primary_contact_email || 'No market/contact set'}</span>
                            </span>
                            <input
                              type="checkbox"
                              checked={selectedVenueIds.includes(venue.id)}
                              onChange={() => toggleVenue(venue.id)}
                              className="h-4 w-4 rounded border-slate-300 text-[#0A52EF] focus:ring-[#0A52EF]"
                            />
                          </label>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Creating…' : 'Create Portal Invite'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowNew(false); resetForm() }}
                    className="h-10 rounded-lg px-3 text-sm font-medium text-slate-500 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {viewAsError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{viewAsError}</div>
        )}

        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Organization</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Last Login</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No customer accounts yet.</td></tr>
              ) : users.map((user) => (
                <tr key={user.id} className={user.is_active ? '' : 'opacity-50'}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{user.full_name}</div>
                    <div className="text-xs text-slate-500">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-slate-700">{user.client_name || '—'}</div>
                    {user.venue_count > 0 && <div className="text-xs text-slate-400">{user.venue_count} venue{user.venue_count === 1 ? '' : 's'}</div>}
                  </td>
                  <td className="px-4 py-3">
                    {!user.is_active ? (
                      <span className="inline-flex rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500">Deactivated</span>
                    ) : user.has_password ? (
                      <span className="inline-flex rounded-full bg-green-100 px-2.5 py-0.5 text-xs text-green-700">Active</span>
                    ) : (
                      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-0.5 text-xs text-amber-700">Invite pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {user.last_login_at ? new Date(user.last_login_at).toLocaleString() : 'Never'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3 whitespace-nowrap">
                      {user.is_active && !user.has_password && user.invite_token && (
                        <>
                          <button onClick={() => resendInvite(user)} className="text-xs font-medium text-[#0A52EF] hover:underline">
                            {resent === `sending:${user.id}` ? 'Sending…' : resent === `sent:${user.id}` ? 'Invite emailed' : resent === `fail:${user.id}` ? 'Email failed — copy link' : 'Email invite'}
                          </button>
                          <button onClick={() => copyText(inviteFor(user), user.id)} className="text-xs font-medium text-[#0A52EF] hover:underline">
                            {copied === user.id ? 'Copied' : 'Copy invite'}
                          </button>
                        </>
                      )}
                      {isAdmin && user.is_active && (
                        <button
                          onClick={() => viewAs(user)}
                          disabled={impersonating === user.id}
                          className="text-xs font-medium text-[#0A52EF] hover:underline disabled:opacity-50"
                          title={`Open the portal exactly as ${user.full_name} sees it (read-only)`}
                        >
                          {impersonating === user.id ? 'Opening…' : 'View as'}
                        </button>
                      )}
                      <button onClick={() => toggleActive(user)} className="text-xs font-medium text-slate-500 hover:underline">
                        {user.is_active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </DashboardLayout>
  )
}
