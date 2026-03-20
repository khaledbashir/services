'use client'

import { useEffect, useState, FormEvent, ChangeEvent } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton, TableSkeleton } from '@/components/skeleton'
import { useToast } from '@/components/toast'

interface Staff {
  id: string
  full_name: string
  email: string
  phone: string
  role: string
  is_active: boolean
}

const roleColors: Record<string, { bg: string; text: string }> = {
  admin: { bg: 'bg-blue-50', text: 'text-[#0A52EF]' },
  manager: { bg: 'bg-emerald-50', text: 'text-emerald-600' },
  technician: { bg: 'bg-zinc-100', text: 'text-zinc-600' },
}

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'technician',
    password: '',
  })
  const [submitting, setSubmitting] = useState(false)
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
          password: formData.password,
        }),
      })

      if (res.ok) {
        const data = await res.json()
        setStaff([...staff, data.staff])
        setFormData({ name: '', email: '', phone: '', role: 'technician', password: '' })
        setShowForm(false)
        showToast('Staff member added', 'success')
      } else {
        showToast('Failed to add staff member', 'error')
      }
    } catch (err) {
      console.error('Failed:', err)
      showToast('Error adding staff member', 'error')
    } finally {
      setSubmitting(false)
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-zinc-900">Staff</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-[#0A52EF] text-white rounded text-sm font-medium hover:bg-[#0840C0] transition-colors"
          >
            {showForm ? 'Cancel' : '+ Add Staff'}
          </button>
        </div>

        {showForm && (
          <div className="bg-white rounded shadow-sm border border-[#E8E8E8] p-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-900 mb-1">Full Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500 text-zinc-900"
                  placeholder="John Doe"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">Email</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500 text-zinc-900"
                    placeholder="john@example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500 text-zinc-900"
                    placeholder="(555) 000-0000"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-1">Role</label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500 text-zinc-900"
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
                    className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500 text-zinc-900"
                    placeholder="••••••••"
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

        <div className="bg-white rounded shadow-sm border border-[#E8E8E8] overflow-hidden">
          {loading ? (
            <TableSkeleton rows={8} cols={5} />
          ) : staff.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-zinc-500 text-sm">No staff members found</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#E8E8E8] bg-zinc-50">
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Name</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Email</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Phone</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Role</th>
                  <th className="text-left py-3 px-6 text-xs font-medium text-zinc-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const roleColor = getRoleColor(member.role)
                  return (
                    <tr key={member.id} className="border-b border-[#E8E8E8] hover:bg-zinc-50 transition-colors">
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${getAvatarColor(member.id)}`}>
                            {getInitials(member.full_name)}
                          </div>
                          <span className="font-medium text-zinc-900">{member.full_name}</span>
                        </div>
                      </td>
                      <td className="py-3 px-6 text-zinc-600">{member.email}</td>
                      <td className="py-3 px-6 text-zinc-600 font-mono text-xs">{member.phone}</td>
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
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
