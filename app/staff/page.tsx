'use client'

import { useEffect, useState, FormEvent, ChangeEvent } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton, TableSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'
import { useAuth } from '@/lib/useAuth'

interface Staff {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  title: string | null
  city: string | null
  profile_image: string | null
  is_active: boolean
}

const roleColors: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'bg-blue-50', text: 'text-[#0A52EF]' },
  manager: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  technician: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
}

export default function StaffPage() {
  const auth = useAuth('admin')
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'cards' | 'list'>('cards')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'technician',
    title: '',
    city: '',
    password: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: number; errors: number } | null>(null)
  const [uploadingImage, setUploadingImage] = useState<string | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    const fetchStaff = async () => {
      try {
        const res = await fetch('/api/staff')
        if (res.ok) {
          const data = await res.json()
          setStaff(data.staff || [])
        }
      } catch (err) {
        console.error('Failed to fetch staff:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchStaff()
  }, [])

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      showToast('Name is required', 'error')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: formData.name,
          email: formData.email,
          phone: formData.phone,
          role: formData.role,
          password: formData.password || 'changeme123',
        }),
      })

      if (res.ok) {
        // Update the new staff with title/city if provided
        const data = await res.json()
        if (formData.title || formData.city) {
          await fetch(`/api/staff/${data.staff.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: formData.title || null, city: formData.city || null }),
          })
        }
        // Refresh list
        const staffRes = await fetch('/api/staff')
        if (staffRes.ok) {
          const staffData = await staffRes.json()
          setStaff(staffData.staff || [])
        }
        setFormData({ name: '', email: '', phone: '', role: 'technician', title: '', city: '', password: '' })
        setShowForm(false)
        showToast('Staff member added', 'success')
      } else {
        showToast('Failed to add staff member', 'error')
      }
    } catch (err) {
      showToast('Error adding staff member', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const handleImageUpload = async (staffId: string, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(staffId)

    try {
      // Convert to base64
      const reader = new FileReader()
      reader.onload = async () => {
        const base64 = reader.result as string
        const res = await fetch(`/api/staff/${staffId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile_image: base64 }),
        })

        if (res.ok) {
          setStaff(staff.map(s => s.id === staffId ? { ...s, profile_image: base64 } : s))
          showToast('Photo updated', 'success')
        }
        setUploadingImage(null)
      }
      reader.readAsDataURL(file)
    } catch {
      showToast('Failed to upload photo', 'error')
      setUploadingImage(null)
    }
  }

  const handleInlineEdit = async (staffId: string, field: string, value: string) => {
    try {
      const res = await fetch(`/api/staff/${staffId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value || null }),
      })
      if (res.ok) {
        const data = await res.json()
        setStaff(staff.map(s => s.id === staffId ? { ...s, ...data.staff } : s))
      }
    } catch {}
    setEditingId(null)
  }

  const downloadTemplate = () => {
    const headers = ['Full Name', 'Email', 'Phone', 'Role']
    const example = ['John Doe', 'john@example.com', '(555) 123-4567', 'technician']
    const csv = [headers.join(','), example.join(',')].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'staff-import-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImporting(true)
    setImportResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/staff/import', {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const data = await res.json()
        setImportResult({ imported: data.imported, skipped: data.skipped, errors: data.errors })
        showToast(`Imported ${data.imported} staff members`, 'success')

        const staffRes = await fetch('/api/staff')
        if (staffRes.ok) {
          const staffData = await staffRes.json()
          setStaff(staffData.staff || [])
        }
      } else {
        const data = await res.json()
        showToast(data.error || 'Import failed', 'error')
      }
    } catch {
      showToast('Error importing file', 'error')
    } finally {
      setImporting(false)
      e.target.value = ''
    }
  }

  const getInitials = (name: string) => {
    const parts = name.split(' ')
    return (parts[0]?.[0] + (parts[1]?.[0] || '')).toUpperCase()
  }

  const getAvatarColor = (id: string) => {
    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-purple-500', 'bg-pink-500']
    const hash = id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
    return colors[hash % colors.length]
  }

  const getRoleColor = (role: string) => {
    return roleColors[role] || { bg: 'bg-zinc-100', text: 'text-zinc-600' }
  }

  const Avatar = ({ member, size = 'md' }: { member: Staff; size?: 'sm' | 'md' | 'lg' }) => {
    const sizeClasses = { sm: 'w-8 h-8 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-20 h-20 text-xl' }
    if (member.profile_image) {
      return <img src={member.profile_image} alt={member.full_name} className={`${sizeClasses[size]} rounded-full object-cover`} />
    }
    return (
      <div className={`${sizeClasses[size]} rounded-full flex items-center justify-center text-white font-semibold ${getAvatarColor(member.id)}`}>
        {getInitials(member.full_name)}
      </div>
    )
  }

  const CardView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {staff.map((member) => {
        const roleColor = getRoleColor(member.role)
        return (
          <div key={member.id} onClick={() => router.push(`/staff/${member.id}`)} className="bg-white rounded border border-[#E8E8E8] shadow-sm hover:shadow-md transition-all overflow-hidden cursor-pointer">
            <div className="p-6 flex flex-col items-center text-center">
              {/* Avatar with upload */}
              <div className="relative group mb-3" onClick={(e) => e.stopPropagation()}>
                <Avatar member={member} size="lg" />
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  {uploadingImage === member.id ? (
                    <span className="text-white text-xs">...</span>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleImageUpload(member.id, e)}
                    disabled={uploadingImage === member.id}
                  />
                </label>
              </div>

              <h3 className="text-sm font-semibold text-zinc-900">{member.full_name}</h3>
              {member.title && <p className="text-xs text-zinc-500 mt-0.5">{member.title}</p>}

              <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${roleColor.bg} ${roleColor.text}`}>
                {member.role}
              </span>

              <div className={`flex items-center gap-1.5 mt-2 ${member.is_active ? 'text-emerald-600' : 'text-zinc-400'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${member.is_active ? 'bg-emerald-500' : 'bg-zinc-300'}`}></div>
                <span className="text-xs">{member.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>

            <div className="border-t border-[#E8E8E8] px-6 py-3 space-y-1.5 bg-zinc-50/50">
              {member.email && (
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <span className="truncate">{member.email}</span>
                </div>
              )}
              {member.phone && (
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  <span>{member.phone}</span>
                </div>
              )}
              {member.city && (
                <div className="flex items-center gap-2 text-xs text-zinc-600">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>{member.city}</span>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  const ListView = () => (
    <div className="bg-white rounded shadow-sm border border-[#E8E8E8] overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#E8E8E8] bg-zinc-50">
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Title</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Email</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Phone</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">City</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Role</th>
            <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {staff.map((member) => {
            const roleColor = getRoleColor(member.role)
            return (
              <tr key={member.id} onClick={() => router.push(`/staff/${member.id}`)} className="border-b border-[#E8E8E8] hover:bg-zinc-50 transition-colors cursor-pointer">
                <td className="py-3 px-6">
                  <div className="flex items-center gap-3">
                    <Avatar member={member} size="sm" />
                    <span className="font-medium text-zinc-900">{member.full_name}</span>
                  </div>
                </td>
                <td className="py-3 px-6 text-zinc-600 text-xs">{member.title || '-'}</td>
                <td className="py-3 px-6 text-zinc-600">{member.email}</td>
                <td className="py-3 px-6 text-zinc-600 font-mono text-xs">{member.phone || '-'}</td>
                <td className="py-3 px-6 text-zinc-600 text-xs">{member.city || '-'}</td>
                <td className="py-3 px-6">
                  <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${roleColor.bg} ${roleColor.text}`}>
                    {member.role}
                  </span>
                </td>
                <td className="py-3 px-6">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${member.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`}></div>
                    <span className={`text-xs ${member.is_active ? 'text-emerald-700' : 'text-zinc-500'}`}>{member.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-zinc-900">Staff</h1>
          <div className="flex gap-2">
            {/* View toggle */}
            <div className="bg-zinc-100 rounded p-1 flex gap-1">
              <button
                onClick={() => setView('cards')}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${view === 'cards' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}
              >
                Cards
              </button>
              <button
                onClick={() => setView('list')}
                className={`px-3 py-2 rounded text-sm font-medium transition-colors ${view === 'list' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-600 hover:text-zinc-900'}`}
              >
                List
              </button>
            </div>
            <button
              onClick={downloadTemplate}
              className="px-4 py-2 bg-white text-zinc-700 border border-[#E8E8E8] rounded text-sm font-medium hover:border-zinc-300 transition-colors"
            >
              Download Template
            </button>
            <label className={`px-4 py-2 bg-white text-zinc-700 border border-[#E8E8E8] rounded text-sm font-medium hover:border-zinc-300 transition-colors cursor-pointer ${importing ? 'opacity-50 pointer-events-none' : ''}`}>
              {importing ? 'Importing...' : 'Import'}
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleImport}
                className="hidden"
                disabled={importing}
              />
            </label>
            <button
              onClick={() => setShowForm(!showForm)}
              className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] transition-colors"
            >
              {showForm ? 'Cancel' : '+ Add Staff'}
            </button>
          </div>
        </div>

        {importResult && (
          <div className="bg-blue-50 border border-blue-200 rounded p-4 flex items-center justify-between">
            <div className="text-sm text-blue-900">
              Import complete: <span className="font-semibold">{importResult.imported}</span> imported, <span className="font-semibold">{importResult.skipped}</span> skipped, <span className="font-semibold">{importResult.errors}</span> errors
            </div>
            <button onClick={() => setImportResult(null)} className="text-blue-500 hover:text-blue-700 text-sm font-medium">Dismiss</button>
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded shadow-sm border border-[#E8E8E8] p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">Full Name *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">Title</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    placeholder="Field Technician"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    placeholder="(555) 000-0000"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">City</label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    placeholder="New York"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                  >
                    <option value="technician">Technician</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 text-zinc-900"
                    placeholder="Default: changeme123"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 bg-[#0A52EF] text-white rounded font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50"
              >
                {submitting ? 'Adding...' : 'Add Staff Member'}
              </button>
            </form>
          </div>
        )}

        {loading ? (
          view === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-52" />
              ))}
            </div>
          ) : (
            <TableSkeleton rows={8} cols={7} />
          )
        ) : staff.length === 0 ? (
          <div className="bg-white rounded shadow-sm border border-[#E8E8E8] p-12 text-center">
            <p className="text-zinc-500 text-sm">No staff members found</p>
          </div>
        ) : view === 'cards' ? (
          <CardView />
        ) : (
          <ListView />
        )}
      </div>
    </DashboardLayout>
  )
}
