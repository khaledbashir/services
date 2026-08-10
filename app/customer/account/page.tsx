'use client'

import { useEffect, useState } from 'react'
import PortalShell, { usePortal } from '../PortalShell'

function AccountContent() {
  const { user } = usePortal()
  const [fullName, setFullName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    if (user?.fullName) setFullName(user.fullName)
  }, [user?.fullName])

  const impersonating = Boolean(user?.impersonating)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const res = await fetch('/api/customer/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, currentPassword, newPassword, confirmPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error || 'We could not save those changes.')
        return
      }
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      const changed = [
        data?.name_changed ? 'name' : null,
        data?.password_changed ? 'password' : null,
      ].filter(Boolean)
      setSuccess(changed.length ? `Your ${changed.join(' and ')} ${changed.length > 1 ? 'have' : 'has'} been updated.` : 'Saved.')
    } catch {
      setError('We could not save those changes.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      {/* Matches every other portal tab: cp-hero lays its subtitle out beside
          the title, which pushed this description to the far right of the page. */}
      <div className="mb-6">
        <h1 className="cp-page-title">Account settings</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          Update the name shown on your account and change your password.
        </p>
      </div>

      <div className="cp-panel" style={{ padding: 24, maxWidth: 560 }}>
        {impersonating && (
          <div className="cp-error" style={{ marginBottom: 16 }}>
            You are viewing this portal as {user?.fullName}. Account settings are read-only in this mode.
          </div>
        )}

        <form onSubmit={save}>
          <div style={{ marginBottom: 20 }}>
            <label className="cp-label" htmlFor="account-name">Name</label>
            <input
              id="account-name"
              className="cp-input"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              autoComplete="name"
              disabled={impersonating || saving}
            />
            <p className="text-xs" style={{ color: 'var(--anc-muted)', marginTop: 6 }}>
              Optional — leave it as it is if you only want to change your password.
            </p>
          </div>

          <div style={{ borderTop: '1px solid var(--anc-border, #e2e8f0)', paddingTop: 20 }}>
            <div className="cp-section-title" style={{ marginBottom: 12 }}>Change password</div>

            <div style={{ marginBottom: 14 }}>
              <label className="cp-label" htmlFor="account-current">Current password</label>
              <input
                id="account-current"
                className="cp-input"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                disabled={impersonating || saving}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="cp-label" htmlFor="account-new">New password</label>
              <input
                id="account-new"
                className="cp-input"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                disabled={impersonating || saving}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label className="cp-label" htmlFor="account-confirm">Confirm new password</label>
              <input
                id="account-confirm"
                className="cp-input"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                disabled={impersonating || saving}
              />
            </div>
          </div>

          {error && <div className="cp-error" style={{ marginTop: 8 }}>{error}</div>}
          {success && (
            <div className="cp-msg" style={{ marginTop: 8, color: 'var(--cp-green)' }}>{success}</div>
          )}

          <button
            type="submit"
            className="cp-btn"
            style={{ marginTop: 18 }}
            disabled={impersonating || saving}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function CustomerAccountPage() {
  return (
    <PortalShell active="Account settings">
      <AccountContent />
    </PortalShell>
  )
}
