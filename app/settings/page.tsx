'use client'

import { useEffect, useState, FormEvent } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'

interface AutoTask {
  id: string
  name: string
  description: string
  schedule: string
  enabled: boolean
}

interface LeagueSetting {
  id: string
  league: string
  estimated_hours: number
}

export default function SettingsPage() {
  const [tasks, setTasks] = useState<AutoTask[]>([])
  const [leagues, setLeagues] = useState<LeagueSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newTask, setNewTask] = useState({ name: '', description: '', schedule: '' })
  const [creating, setCreating] = useState(false)
  const [savingLeague, setSavingLeague] = useState<string | null>(null)

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/settings/cron')
      const data = await res.json()
      setTasks(data.jobs || [])
    } catch {} finally { setLoading(false) }
  }

  const fetchLeagues = async () => {
    try {
      const res = await fetch('/api/settings/leagues')
      const data = await res.json()
      setLeagues(data.leagues || [])
    } catch {}
  }

  const updateLeagueHours = async (id: string, estimated_hours: number) => {
    setSavingLeague(id)
    try {
      const res = await fetch('/api/settings/leagues', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, estimated_hours }),
      })
      if (res.ok) {
        const data = await res.json()
        setLeagues(data.leagues || [])
      }
    } catch {} finally { setSavingLeague(null) }
  }

  useEffect(() => { fetchTasks(); fetchLeagues() }, [])

  const toggleTask = async (id: string, enabled: boolean) => {
    // Optimistic update
    setTasks(tasks.map(t => t.id === id ? { ...t, enabled } : t))
    try {
      await fetch('/api/settings/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, enabled }),
      })
    } catch { fetchTasks() }
  }

  const deleteTask = async (id: string) => {
    if (!confirm('Remove this automated task?')) return
    setTasks(tasks.filter(t => t.id !== id))
    try {
      await fetch('/api/settings/cron', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      })
    } catch { fetchTasks() }
  }

  const addTask = async (e: FormEvent) => {
    e.preventDefault()
    if (!newTask.name || !newTask.schedule) return
    setCreating(true)
    try {
      const res = await fetch('/api/settings/cron', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTask),
      })
      if (res.ok) {
        const data = await res.json()
        setTasks(data.jobs || [])
        setNewTask({ name: '', description: '', schedule: '' })
        setShowAdd(false)
      }
    } catch {} finally { setCreating(false) }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* League Estimated Hours */}
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">League Settings</h2>
          <p className="text-sm text-zinc-500 mt-1">Default estimated hours per game type — used for labor budget tracking</p>
        </div>

        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm">
          <div className="px-6 py-4 border-b border-[#E8E8E8]">
            <h3 className="text-sm font-semibold text-zinc-900">Estimated Hours by League</h3>
          </div>
          {leagues.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>
          ) : (
            <div className="divide-y divide-[#E8E8E8]">
              {leagues.map(league => (
                <div key={league.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                  <span className="text-sm font-medium text-zinc-900">{league.league}</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      value={league.estimated_hours}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0
                        setLeagues(leagues.map(l => l.id === league.id ? { ...l, estimated_hours: val } : l))
                      }}
                      className="w-20 border border-[#E8E8E8] rounded px-3 py-1.5 text-sm text-right focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                    />
                    <span className="text-xs text-zinc-400">hrs</span>
                    <button
                      onClick={() => updateLeagueHours(league.id, league.estimated_hours)}
                      disabled={savingLeague === league.id}
                      className="text-xs text-[#0A52EF] hover:text-[#0840C0] font-medium disabled:opacity-50 px-2"
                    >
                      {savingLeague === league.id ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-[#E8E8E8] pt-6"></div>

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900">Automations</h2>
            <p className="text-sm text-zinc-500 mt-1">Manage automated Slack notifications and scheduled tasks</p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className="bg-[#0A52EF] text-white px-4 py-2 rounded text-sm font-medium hover:bg-[#0840C0] transition-colors"
          >
            {showAdd ? 'Cancel' : '+ New Automation'}
          </button>
        </div>

        {showAdd && (
          <div className="bg-white rounded border border-[#E8E8E8] shadow-sm p-6">
            <h3 className="text-sm font-semibold text-zinc-900 mb-4">Create Automation</h3>
            <form onSubmit={addTask} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Task Name *</label>
                <input type="text" value={newTask.name} onChange={e => setNewTask({...newTask, name: e.target.value})}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                  placeholder="e.g., Staff Coverage Check" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Description</label>
                <input type="text" value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none"
                  placeholder="What this automation does" />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-500 mb-1">Schedule *</label>
                <select value={newTask.schedule} onChange={e => setNewTask({...newTask, schedule: e.target.value})}
                  className="w-full border border-[#E8E8E8] rounded px-3 py-2 text-sm focus:ring-2 focus:ring-[#0A52EF]/30 focus:border-[#0A52EF] outline-none" required>
                  <option value="">Select schedule...</option>
                  <option value="Every 15 minutes">Every 15 minutes</option>
                  <option value="Every 30 minutes">Every 30 minutes</option>
                  <option value="Every hour">Every hour</option>
                  <option value="8:00 AM ET daily">Daily at 8:00 AM ET</option>
                  <option value="9:00 AM ET daily">Daily at 9:00 AM ET</option>
                  <option value="5:00 PM ET daily">Daily at 5:00 PM ET</option>
                  <option value="Monday 8:00 AM ET">Weekly (Monday 8 AM ET)</option>
                  <option value="Friday 5:00 PM ET">Weekly (Friday 5 PM ET)</option>
                </select>
              </div>
              <button type="submit" disabled={creating}
                className="bg-[#0A52EF] text-white px-5 py-2 rounded text-sm font-medium hover:bg-[#0840C0] disabled:opacity-50 transition-colors">
                {creating ? 'Creating...' : 'Create Automation'}
              </button>
            </form>
          </div>
        )}

        <div className="bg-white rounded border border-[#E8E8E8] shadow-sm">
          <div className="px-6 py-4 border-b border-[#E8E8E8]">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">Slack Bot Automations</h3>
                <p className="text-xs text-zinc-400 mt-0.5">Delivering to #external--ai-services</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-zinc-400 text-sm">Loading...</div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center text-zinc-400 text-sm">No automated tasks configured</div>
          ) : (
            <div className="divide-y divide-[#E8E8E8]">
              {tasks.map(task => (
                <div key={task.id} className="px-6 py-4 flex items-center justify-between hover:bg-zinc-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h4 className="text-sm font-medium text-zinc-900">{task.name}</h4>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${task.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-zinc-100 text-zinc-400'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${task.enabled ? 'bg-emerald-500' : 'bg-zinc-300'}`}></span>
                        {task.enabled ? 'Active' : 'Paused'}
                      </span>
                    </div>
                    {task.description && <p className="text-xs text-zinc-400 mt-0.5">{task.description}</p>}
                    <p className="text-xs text-zinc-500 mt-1">{task.schedule}</p>
                  </div>
                  <div className="flex items-center gap-3 ml-4">
                    {/* Toggle switch */}
                    <button
                      onClick={() => toggleTask(task.id, !task.enabled)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${task.enabled ? 'bg-[#0A52EF]' : 'bg-zinc-300'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${task.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                    {/* Delete */}
                    <button
                      onClick={() => deleteTask(task.id)}
                      className="text-zinc-300 hover:text-red-500 transition-colors text-sm"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
