'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  Pencil,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { useAuth } from '@/lib/useAuth'
import {
  CUSTOMER_PORTAL_TABS,
  DEFAULT_CUSTOMER_PORTAL_TABS,
  type CustomerPortalTabKey,
} from '@/lib/customer-portal-tabs'

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
  venue_ids: string[]
  visible_tabs: CustomerPortalTabKey[]
}

interface VenueOption {
  id: string
  name: string
  market?: string | null
  primary_contact_email?: string | null
}

interface ContactDraft {
  full_name: string
  email: string
}

interface InvitationResult {
  user: { id: string; email: string; full_name: string }
  invite_url: string
  invite_sent: boolean
}

const emptyContact = (): ContactDraft => ({ full_name: '', email: '' })

function toggleValue<T extends string>(current: T[], value: T): T[] {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value]
}

export default function PortalUsersAdminPage() {
  const { isAdmin } = useAuth('manager')
  const [users, setUsers] = useState<PortalUser[]>([])
  const [venues, setVenues] = useState<VenueOption[]>([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState('')
  const [showInactive, setShowInactive] = useState(false)

  const [showNew, setShowNew] = useState(false)
  const [contacts, setContacts] = useState<ContactDraft[]>([emptyContact()])
  const [selectedVenueIds, setSelectedVenueIds] = useState<string[]>([])
  const [visibleTabs, setVisibleTabs] = useState<CustomerPortalTabKey[]>([...DEFAULT_CUSTOMER_PORTAL_TABS])
  const [venueSearch, setVenueSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [invitations, setInvitations] = useState<InvitationResult[]>([])
  const [customerUrl, setCustomerUrl] = useState('')

  const [editing, setEditing] = useState<PortalUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [editVenueIds, setEditVenueIds] = useState<string[]>([])
  const [editVisibleTabs, setEditVisibleTabs] = useState<CustomerPortalTabKey[]>([])
  const [editVenueSearch, setEditVenueSearch] = useState('')
  const [editAdditionalContacts, setEditAdditionalContacts] = useState<ContactDraft[]>([])
  const [editInvitations, setEditInvitations] = useState<InvitationResult[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  const [copied, setCopied] = useState('')
  const [resent, setResent] = useState('')
  const [impersonating, setImpersonating] = useState('')
  const [viewAsError, setViewAsError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setPageError('')
    try {
      const [usersRes, venuesRes] = await Promise.all([
        fetch('/api/customer-users'),
        fetch('/api/venues'),
      ])
      if (!usersRes.ok) throw new Error(`Customer access request failed (${usersRes.status})`)
      if (!venuesRes.ok) throw new Error(`Venue request failed (${venuesRes.status})`)
      const [usersData, venuesData] = await Promise.all([usersRes.json(), venuesRes.json()])
      setUsers(usersData.users || [])
      setVenues((venuesData.venues || []).map((venue: any) => ({
        id: venue.id,
        name: venue.name,
        market: venue.market,
        primary_contact_email: venue.primary_contact_email,
      })))
    } catch (error) {
      console.error('Failed to load customer portal setup:', error)
      setPageError('Customer portal setup could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    fetch('/api/preferences?key=portalUsers.showInactive')
      .then(async (response) => {
        if (!response.ok) throw new Error(`Preferences request failed (${response.status})`)
        return response.json()
      })
      .then((data) => setShowInactive(data.value === 'true'))
      .catch((error) => console.error('Failed to load customer access preference:', error))
  }, [load])

  const venueNames = useMemo(
    () => new Map(venues.map((venue) => [venue.id, venue.name])),
    [venues]
  )

  const activeUsers = users.filter((user) => user.is_active)
  const inactiveCount = users.length - activeUsers.length
  const displayedUsers = showInactive ? users : activeUsers

  const filteredCreateVenues = useMemo(
    () => filterVenues(venues, venueSearch),
    [venueSearch, venues]
  )
  const filteredEditVenues = useMemo(
    () => filterVenues(venues, editVenueSearch),
    [editVenueSearch, venues]
  )

  // Every venue is listed. This used to stop at the first 100, which cut the
  // alphabet off around M and made the venues past it reachable only by typing
  // a search — Charlie 2026-08-17. A few hundred checkbox rows inside the
  // scroll container cost nothing, and a silently short list costs access.
  function filterVenues(source: VenueOption[], search: string) {
    const q = search.trim().toLowerCase()
    if (!q) return source
    return source.filter((venue) =>
      [venue.name, venue.market, venue.primary_contact_email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    )
  }

  function resetCreate() {
    setContacts([emptyContact()])
    setSelectedVenueIds([])
    setVisibleTabs([...DEFAULT_CUSTOMER_PORTAL_TABS])
    setVenueSearch('')
    setFormError('')
    setInvitations([])
  }

  async function copyText(value: string, key: string) {
    if (!value) return
    await navigator.clipboard.writeText(value)
    setCopied(key)
    window.setTimeout(() => setCopied(''), 2000)
  }

  async function updateShowInactive(next: boolean) {
    setShowInactive(next)
    try {
      const response = await fetch('/api/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'portalUsers.showInactive', value: String(next) }),
      })
      if (!response.ok) throw new Error(`Preferences request failed (${response.status})`)
    } catch (error) {
      console.error('Failed to save customer access preference:', error)
      setPageError('The deactivated-user preference could not be saved.')
    }
  }

  function updateContact(index: number, field: keyof ContactDraft, value: string) {
    setContacts((current) => current.map((contact, contactIndex) =>
      contactIndex === index ? { ...contact, [field]: value } : contact
    ))
  }

  async function createUsers(event: React.FormEvent) {
    event.preventDefault()
    setFormError('')
    if (selectedVenueIds.length === 0) {
      setFormError('Select at least one venue.')
      return
    }
    if (visibleTabs.length === 0) {
      setFormError('Select at least one visible portal tab.')
      return
    }

    setSubmitting(true)
    try {
      const response = await fetch('/api/customer-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts,
          linked_venue_ids: selectedVenueIds,
          visible_tabs: visibleTabs,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFormError(data.error || 'Could not create customer access.')
        return
      }
      setInvitations(data.invitations || [])
      setCustomerUrl(data.customer_url || `${window.location.origin}/customer`)
      await load()
    } catch (error) {
      console.error('Failed to create customer access:', error)
      setFormError('Could not create customer access.')
    } finally {
      setSubmitting(false)
    }
  }

  function startEdit(user: PortalUser) {
    setEditing(user)
    setEditName(user.full_name)
    setEditEmail(user.email)
    setEditVenueIds(user.venue_ids || [])
    setEditVisibleTabs(user.visible_tabs || [...DEFAULT_CUSTOMER_PORTAL_TABS])
    setEditVenueSearch('')
    setEditAdditionalContacts([])
    setEditInvitations([])
    setEditError('')
  }

  function updateEditContact(index: number, field: keyof ContactDraft, value: string) {
    setEditAdditionalContacts((current) => current.map((contact, contactIndex) =>
      contactIndex === index ? { ...contact, [field]: value } : contact
    ))
  }

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!editing) return
    setEditError('')
    if (editVenueIds.length === 0) {
      setEditError('Select at least one venue.')
      return
    }
    if (editVisibleTabs.length === 0) {
      setEditError('Select at least one visible portal tab.')
      return
    }

    setSavingEdit(true)
    try {
      const response = await fetch('/api/customer-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editing.id,
          full_name: editName,
          email: editEmail,
          linked_venue_ids: editVenueIds,
          visible_tabs: editVisibleTabs,
          additional_contacts: editAdditionalContacts,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setEditError(data.error || 'Could not save customer access.')
        return
      }
      setEditInvitations(data.invitations || [])
      setEditing(null)
      await load()
    } catch (error) {
      console.error('Failed to edit customer access:', error)
      setEditError('Could not save customer access.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function resendInvite(user: PortalUser) {
    setResent(`sending:${user.id}`)
    try {
      const response = await fetch('/api/customer-users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, resend_invite: true }),
      })
      const data = await response.json().catch(() => ({}))
      setResent(response.ok && data.invite_sent ? `sent:${user.id}` : `fail:${user.id}`)
    } catch (error) {
      console.error('Failed to resend portal invite:', error)
      setResent(`fail:${user.id}`)
    }
    await load()
  }

  async function viewAs(user: PortalUser) {
    setViewAsError('')
    setImpersonating(user.id)
    try {
      const response = await fetch(`/api/customer-users/${user.id}/impersonate`, { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setViewAsError(data.error || 'Could not open that customer view.')
        setImpersonating('')
        return
      }
      window.location.href = data.customer_url || '/customer'
    } catch (error) {
      console.error('Failed to impersonate portal user:', error)
      setViewAsError('Could not open that customer view.')
      setImpersonating('')
    }
  }

  async function toggleActive(user: PortalUser) {
    const response = await fetch('/api/customer-users', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: user.id, is_active: !user.is_active }),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      setPageError(data.error || 'Could not update customer access.')
      return
    }
    await load()
  }

  function inviteFor(user: PortalUser) {
    return user.invite_token
      ? `${window.location.origin}/customer/invite/${user.invite_token}`
      : ''
  }

  function venuePicker({
    selected,
    setSelected,
    search,
    setSearch,
    filtered,
  }: {
    selected: string[]
    setSelected: (value: string[]) => void
    search: string
    setSearch: (value: string) => void
    filtered: VenueOption[]
  }) {
    return (
      <div className="rounded-xl border border-zinc-200">
        <div className="border-b border-zinc-200 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="text-sm font-semibold text-zinc-800">Venue access</div>
              <div className="mt-0.5 text-xs text-zinc-500">
                {selected.length > 0
                  ? selected.map((id) => venueNames.get(id)).filter(Boolean).join(', ')
                  : 'Select every venue this customer can see.'}
              </div>
            </div>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-9 rounded-lg border border-zinc-300 px-3 text-sm outline-none focus:border-[#0A52EF]"
              placeholder="Search venues"
            />
          </div>
        </div>
        <div className="max-h-64 overflow-auto p-2">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-400">No active venues found.</div>
          ) : filtered.map((venue) => (
            <label key={venue.id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-zinc-50">
              <span className="min-w-0">
                <span className="block truncate font-medium text-zinc-800">{venue.name}</span>
                <span className="block truncate text-xs text-zinc-400">{venue.market || venue.primary_contact_email || 'No market/contact set'}</span>
              </span>
              <input
                type="checkbox"
                checked={selected.includes(venue.id)}
                onChange={() => setSelected(toggleValue(selected, venue.id))}
                className="h-4 w-4 rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]"
              />
            </label>
          ))}
        </div>
      </div>
    )
  }

  function tabPicker(
    selected: CustomerPortalTabKey[],
    setSelected: (value: CustomerPortalTabKey[]) => void
  ) {
    return (
      <div className="rounded-xl border border-zinc-200 p-4">
        <div className="text-sm font-semibold text-zinc-800">Visible portal tabs</div>
        <p className="mt-1 text-xs text-zinc-500">
          Overview and Requests are selected by default. Enable additional areas only when this portal needs them.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {CUSTOMER_PORTAL_TABS.map((tab) => (
            <label key={tab.key} className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50">
              <input
                type="checkbox"
                checked={selected.includes(tab.key)}
                onChange={() => setSelected(toggleValue(selected, tab.key))}
                className="h-4 w-4 rounded border-zinc-300 text-[#0A52EF] focus:ring-[#0A52EF]"
              />
              {tab.label}
            </label>
          ))}
        </div>
      </div>
    )
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-6xl space-y-6 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Customer Access</p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Customer Portal Setup</h1>
            <p className="mt-1 max-w-3xl text-sm text-zinc-500">
              Create logins for existing clients, choose exact venue access, and control which portal areas each customer can use.
            </p>
          </div>
          <button
            onClick={() => {
              resetCreate()
              setShowNew(true)
            }}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            <UserPlus className="h-4 w-4" />
            Create Portal
          </button>
        </div>

        {(pageError || viewAsError) && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {pageError || viewAsError}
          </div>
        )}

        {showNew && (
          <section className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
            {invitations.length > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-green-700">
                  <Check className="h-4 w-4" />
                  {invitations.length} customer invite{invitations.length === 1 ? '' : 's'} created
                </div>
                <div className="space-y-3">
                  {invitations.map((invitation) => (
                    <div key={invitation.user.id} className="rounded-lg border border-zinc-200 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className="font-medium text-zinc-900">{invitation.user.full_name}</div>
                          <div className="text-xs text-zinc-500">
                            {invitation.user.email} · {invitation.invite_sent ? 'Invite emailed' : 'Email delivery failed'}
                          </div>
                        </div>
                        <button
                          onClick={() => void copyText(invitation.invite_url, `new:${invitation.user.id}`)}
                          className="inline-flex h-9 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {copied === `new:${invitation.user.id}` ? 'Copied' : 'Copy invite'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3">
                  <a
                    href={customerUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-300 px-3 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Open Login
                  </a>
                  <button
                    onClick={() => {
                      setShowNew(false)
                      resetCreate()
                    }}
                    className="h-10 rounded-lg px-3 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={createUsers} className="space-y-5">
                <div>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold text-zinc-900">Customer contacts</h2>
                      <p className="mt-1 text-xs text-zinc-500">Add every customer who should receive their own login.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setContacts((current) => [...current, emptyContact()])}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add customer
                    </button>
                  </div>
                  <div className="mt-3 space-y-3">
                    {contacts.map((contact, index) => (
                      <div key={index} className="grid gap-3 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
                        <label className="text-sm font-medium text-zinc-700">
                          Customer name
                          <input
                            value={contact.full_name}
                            onChange={(event) => updateContact(index, 'full_name', event.target.value)}
                            required
                            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                            placeholder="Client Contact"
                          />
                        </label>
                        <label className="text-sm font-medium text-zinc-700">
                          Customer email
                          <input
                            type="email"
                            value={contact.email}
                            onChange={(event) => updateContact(index, 'email', event.target.value)}
                            required
                            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                            placeholder="contact@example.com"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={contacts.length === 1}
                          onClick={() => setContacts((current) => current.filter((_, contactIndex) => contactIndex !== index))}
                          className="mt-6 inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-30"
                          aria-label={`Remove customer ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {venuePicker({
                  selected: selectedVenueIds,
                  setSelected: setSelectedVenueIds,
                  search: venueSearch,
                  setSearch: setVenueSearch,
                  filtered: filteredCreateVenues,
                })}
                <p className="-mt-3 text-xs text-zinc-500">
                  The client is resolved from existing venue links. This screen does not create new clients.
                </p>
                {tabPicker(visibleTabs, setVisibleTabs)}

                {formError && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting ? 'Creating…' : `Create ${contacts.length} Portal Invite${contacts.length === 1 ? '' : 's'}`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNew(false)
                      resetCreate()
                    }}
                    className="h-10 rounded-lg px-3 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
        )}

        {editInvitations.length > 0 && !editing && (
          <section className="rounded-xl border border-green-200 bg-green-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
                <Check className="h-4 w-4" />
                Portal saved and {editInvitations.length} customer invite{editInvitations.length === 1 ? '' : 's'} created
              </div>
              <button
                type="button"
                onClick={() => setEditInvitations([])}
                className="text-xs font-medium text-green-700 hover:underline"
              >
                Dismiss
              </button>
            </div>
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {editInvitations.map((invitation) => (
                <div key={invitation.user.id} className="flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-white p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900">{invitation.user.full_name}</div>
                    <div className="truncate text-xs text-zinc-500">
                      {invitation.user.email} · {invitation.invite_sent ? 'Invite emailed' : 'Email delivery failed'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText(invitation.invite_url, `edit:${invitation.user.id}`)}
                    className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-zinc-300 px-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    {copied === `edit:${invitation.user.id}` ? 'Copied' : 'Copy invite'}
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {editing && (
          <section className="rounded-xl border border-blue-200 bg-white p-5 shadow-sm">
            <form onSubmit={saveEdit} className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Editing portal</p>
                  <h2 className="mt-1 text-lg font-semibold text-zinc-900">{editing.full_name}</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-500 hover:bg-zinc-100"
                >
                  Cancel
                </button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-zinc-700">
                  Customer name
                  <input
                    value={editName}
                    onChange={(event) => setEditName(event.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                  />
                </label>
                <label className="text-sm font-medium text-zinc-700">
                  Customer email
                  <input
                    type="email"
                    value={editEmail}
                    onChange={(event) => setEditEmail(event.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                  />
                </label>
              </div>
              <div>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-900">Additional customer contacts</h3>
                    <p className="mt-1 text-xs text-zinc-500">Create more customer logins with the same venue access and visible tabs.</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditAdditionalContacts((current) => [...current, emptyContact()])}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-300 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add customer
                  </button>
                </div>
                {editAdditionalContacts.length === 0 ? (
                  <div className="mt-3 rounded-lg border border-dashed border-zinc-300 px-4 py-3 text-xs text-zinc-500">
                    No additional customers added.
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {editAdditionalContacts.map((contact, index) => (
                      <div key={index} className="grid gap-3 rounded-xl border border-zinc-200 p-3 sm:grid-cols-[1fr_1fr_auto]">
                        <label className="text-sm font-medium text-zinc-700">
                          Customer name
                          <input
                            value={contact.full_name}
                            onChange={(event) => updateEditContact(index, 'full_name', event.target.value)}
                            required
                            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                            placeholder="Client Contact"
                          />
                        </label>
                        <label className="text-sm font-medium text-zinc-700">
                          Customer email
                          <input
                            type="email"
                            value={contact.email}
                            onChange={(event) => updateEditContact(index, 'email', event.target.value)}
                            required
                            className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-[#0A52EF]"
                            placeholder="contact@example.com"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setEditAdditionalContacts((current) => current.filter((_, contactIndex) => contactIndex !== index))}
                          className="mt-6 inline-flex h-10 w-10 items-center justify-center rounded-lg text-zinc-400 hover:bg-red-50 hover:text-red-600"
                          aria-label={`Remove additional customer ${index + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {venuePicker({
                selected: editVenueIds,
                setSelected: setEditVenueIds,
                search: editVenueSearch,
                setSearch: setEditVenueSearch,
                filtered: filteredEditVenues,
              })}
              {tabPicker(editVisibleTabs, setEditVisibleTabs)}
              {editError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{editError}</div>
              )}
              <button
                type="submit"
                disabled={savingEdit}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {savingEdit
                  ? 'Saving…'
                  : editAdditionalContacts.length > 0
                    ? `Save Portal + Add ${editAdditionalContacts.length}`
                    : 'Save Portal'}
              </button>
            </form>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Customer accounts</h2>
              <p className="text-sm text-zinc-500">
                Showing {displayedUsers.length} of {users.length}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void updateShowInactive(!showInactive)}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition ${
                showInactive
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              {showInactive ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              {showInactive ? 'Hide deactivated' : `Show deactivated${inactiveCount ? ` (${inactiveCount})` : ''}`}
            </button>
          </div>

          {loading ? (
            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-400">Loading…</div>
          ) : displayedUsers.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
              {users.length === 0 ? 'No customer accounts yet.' : 'No active customer accounts.'}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1080px] text-left text-sm">
                  <thead className="border-b border-zinc-200 bg-zinc-50">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Customer</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Client</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Venue access</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Visible tabs</th>
                      <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Status</th>
                      <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {displayedUsers.map((user) => {
                      const selectedTabLabels = CUSTOMER_PORTAL_TABS
                        .filter((tab) => user.visible_tabs.includes(tab.key))
                        .map((tab) => tab.label)
                      const selectedVenueNames = user.venue_ids.map((id) => venueNames.get(id)).filter(Boolean)
                      return (
                        <tr key={user.id} className={user.is_active ? 'hover:bg-zinc-50' : 'opacity-60 hover:bg-zinc-50'}>
                          <td className="px-4 py-3 align-top">
                            <div className="font-semibold text-zinc-950">{user.full_name}</div>
                            <div className="mt-0.5 text-xs text-zinc-500">{user.email}</div>
                          </td>
                          <td className="max-w-48 px-4 py-3 align-top text-xs font-medium text-zinc-700">
                            {user.client_name || 'Client link missing'}
                          </td>
                          <td className="max-w-72 px-4 py-3 align-top text-xs leading-5 text-zinc-700">
                            {selectedVenueNames.length > 0
                              ? selectedVenueNames.join(', ')
                              : `${user.venue_count} venue${user.venue_count === 1 ? '' : 's'}`}
                          </td>
                          <td className="max-w-64 px-4 py-3 align-top text-xs leading-5 text-zinc-700">
                            {selectedTabLabels.join(', ') || 'None'}
                          </td>
                          <td className="px-4 py-3 align-top">
                            {!user.is_active ? (
                              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-500">Deactivated</span>
                            ) : user.has_password ? (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">Active</span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Invite pending</span>
                            )}
                            <div className="mt-1.5 whitespace-nowrap text-[11px] text-zinc-400">
                              {user.last_login_at ? `Last login ${new Date(user.last_login_at).toLocaleDateString()}` : 'Never logged in'}
                            </div>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                              <button
                                type="button"
                                onClick={() => startEdit(user)}
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A52EF] hover:underline"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              {user.is_active && !user.has_password && user.invite_token && (
                                <>
                                  <button onClick={() => void resendInvite(user)} className="text-xs font-medium text-[#0A52EF] hover:underline">
                                    {resent === `sending:${user.id}` ? 'Sending…' : resent === `sent:${user.id}` ? 'Invite emailed' : resent === `fail:${user.id}` ? 'Email failed' : 'Email invite'}
                                  </button>
                                  <button onClick={() => void copyText(inviteFor(user), user.id)} className="text-xs font-medium text-[#0A52EF] hover:underline">
                                    {copied === user.id ? 'Copied' : 'Copy invite'}
                                  </button>
                                </>
                              )}
                              {isAdmin && user.is_active && (
                                <button
                                  onClick={() => void viewAs(user)}
                                  disabled={impersonating === user.id}
                                  className="text-xs font-medium text-[#0A52EF] hover:underline disabled:opacity-50"
                                >
                                  {impersonating === user.id ? 'Opening…' : 'View as'}
                                </button>
                              )}
                              <button onClick={() => void toggleActive(user)} className="text-xs font-medium text-zinc-500 hover:underline">
                                {user.is_active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  )
}
