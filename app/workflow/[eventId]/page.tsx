'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useToast } from '@/components/toast'

interface EventDetail {
  id: string
  summary: string
  venue_name: string
  league: string
  start_time: string
  event_date: string
}

interface Workflow {
  checked_in: string | null
  game_ready: string | null
  post_game_submitted: string | null
}

interface Staff {
  id: string
  full_name: string
}

export default function WorkflowPage() {
  const params = useParams()
  const eventId = params.eventId as string
  const { showToast } = useToast()

  const [event, setEvent] = useState<EventDetail | null>(null)
  const [workflow, setWorkflow] = useState<Workflow>({ checked_in: null, game_ready: null, post_game_submitted: null })
  const [assignedTechs, setAssignedTechs] = useState<Staff[]>([])
  const [allStaff, setAllStaff] = useState<Staff[]>([])
  const [selectedTech, setSelectedTech] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [gameReadyData, setGameReadyData] = useState({
    equipment_check: false,
    crew_ready: false,
    communications_test: false,
  })
  const [postGameData, setPostGameData] = useState({ notes: '', incidents: '' })

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await fetch(`/api/workflow/${eventId}`)
        if (res.ok) {
          const data = await res.json()
          setEvent(data.event)
          setWorkflow(data.workflow)
          setAssignedTechs(data.assignedTechs || [])
          setAllStaff(data.allStaff || [])
          if (data.assignedTechs.length > 0) {
            setSelectedTech(data.assignedTechs[0].id)
          } else if (data.allStaff.length > 0) {
            setSelectedTech(data.allStaff[0].id)
          }
        }
      } catch (err) {
        console.error('Failed to fetch event:', err)
        showToast('Failed to load event', 'error')
      } finally {
        setLoading(false)
      }
    }

    fetchEvent()
  }, [eventId, showToast])

  const submitWorkflow = async (type: string) => {
    if (!selectedTech) {
      showToast('Please select a technician', 'error')
      return
    }

    try {
      setSubmitting(true)
      const data = type === 'game_ready' ? gameReadyData : type === 'post_game_submitted' ? postGameData : null

      const res = await fetch(`/api/workflow/${eventId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staffId: selectedTech, type, data }),
      })

      if (res.ok) {
        const result = await res.json()
        setWorkflow(result.workflow)
        showToast('Submission saved', 'success')
        // Reset form data
        if (type === 'game_ready') {
          setGameReadyData({ equipment_check: false, crew_ready: false, communications_test: false })
        } else if (type === 'post_game_submitted') {
          setPostGameData({ notes: '', incidents: '' })
        }
      } else {
        showToast('Failed to submit', 'error')
      }
    } catch (err) {
      console.error('Error submitting workflow:', err)
      showToast('Error submitting workflow', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="h-12 bg-[#0A52EF]"></div>
        <div className="p-4 space-y-4">
          <div className="h-20 bg-zinc-100 rounded animate-pulse"></div>
          <div className="h-40 bg-zinc-100 rounded animate-pulse"></div>
        </div>
      </div>
    )
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-white">
        <div className="h-12 bg-[#0A52EF]"></div>
        <div className="p-4 text-center py-12">
          <p className="text-zinc-500">Event not found</p>
        </div>
      </div>
    )
  }

  const isCheckInDone = workflow.checked_in !== null
  const isGameReadyDone = workflow.game_ready !== null
  const isPostGameDone = workflow.post_game_submitted !== null

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Top bar */}
      <div className="bg-[#0A52EF] text-white py-3 px-4 fixed top-0 left-0 right-0 z-50">
        <p className="font-semibold">ANC Services</p>
      </div>

      <div className="pt-16 pb-8 px-4 max-w-2xl mx-auto">
        {/* Event Card */}
        <div className="bg-white rounded shadow-sm border border-[#E8E8E8] p-4 mb-6">
          <h1 className="text-xl font-semibold text-zinc-900">{event.summary}</h1>
          <p className="text-zinc-600 text-sm mt-1">{event.venue_name}</p>
          <div className="flex gap-4 mt-3 text-xs text-zinc-500 font-mono">
            <span>{formatDate(event.event_date)}</span>
            <span>{formatTime(event.start_time)}</span>
          </div>
        </div>

        {/* Tech Selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-zinc-900 mb-2">Technician</label>
          <select
            value={selectedTech}
            onChange={(e) => setSelectedTech(e.target.value)}
            className="w-full p-3 border border-slate-300 rounded text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500"
          >
            <option value="">Select technician</option>
            {allStaff.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.full_name}
              </option>
            ))}
          </select>
        </div>

        {/* Vertical Progress Steps */}
        <div className="space-y-4">
          {/* Step 1: Check-in */}
          <div className="border border-[#E8E8E8] rounded overflow-hidden bg-white">
            <button
              onClick={() => {
                if (!isCheckInDone && !submitting) {
                  submitWorkflow('checked_in')
                }
              }}
              disabled={submitting}
              className={`w-full p-4 flex items-start gap-3 transition-colors ${isCheckInDone ? 'bg-emerald-50' : 'hover:bg-zinc-50'}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isCheckInDone ? 'bg-emerald-500 text-white' : 'bg-blue-500 text-white'}`}>
                {isCheckInDone ? '✓' : '1'}
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-zinc-900">Check-in</p>
                {isCheckInDone && <p className="text-xs text-emerald-600 mt-1">Completed</p>}
              </div>
            </button>

            {!isCheckInDone && (
              <div className="px-4 pb-4 border-t border-[#E8E8E8]">
                <button
                  onClick={() => submitWorkflow('checked_in')}
                  disabled={submitting || !selectedTech}
                  className="w-full bg-[#0A52EF] text-white py-3 rounded font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Confirming...' : 'Confirm On-Site'}
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Game Ready */}
          <div className="border border-[#E8E8E8] rounded overflow-hidden bg-white">
            <button
              onClick={() => {
                if (isCheckInDone && isGameReadyDone) {
                  // Toggle collapse/expand
                }
              }}
              disabled={!isCheckInDone}
              className={`w-full p-4 flex items-start gap-3 transition-colors ${isGameReadyDone ? 'bg-emerald-50' : isCheckInDone ? 'hover:bg-zinc-50' : 'opacity-50'}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isGameReadyDone ? 'bg-emerald-500 text-white' : isCheckInDone ? 'bg-blue-500 text-white' : 'bg-slate-300'}`}>
                {isGameReadyDone ? '✓' : '2'}
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-zinc-900">Game Ready</p>
                {isGameReadyDone && <p className="text-xs text-emerald-600 mt-1">Completed</p>}
              </div>
            </button>

            {isCheckInDone && !isGameReadyDone && (
              <div className="px-4 pb-4 border-t border-[#E8E8E8] space-y-3">
                <div className="space-y-3">
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={gameReadyData.equipment_check}
                      onChange={(e) => setGameReadyData({ ...gameReadyData, equipment_check: e.target.checked })}
                      className="w-4 h-4 border-slate-300 rounded"
                    />
                    <span className="text-sm text-zinc-900">Equipment check complete</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={gameReadyData.crew_ready}
                      onChange={(e) => setGameReadyData({ ...gameReadyData, crew_ready: e.target.checked })}
                      className="w-4 h-4 border-slate-300 rounded"
                    />
                    <span className="text-sm text-zinc-900">Crew is ready</span>
                  </label>
                  <label className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={gameReadyData.communications_test}
                      onChange={(e) => setGameReadyData({ ...gameReadyData, communications_test: e.target.checked })}
                      className="w-4 h-4 border-slate-300 rounded"
                    />
                    <span className="text-sm text-zinc-900">Communications test passed</span>
                  </label>
                </div>
                <button
                  onClick={() => submitWorkflow('game_ready')}
                  disabled={submitting || !selectedTech}
                  className="w-full bg-[#0A52EF] text-white py-3 rounded font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Confirming...' : 'Confirm Game Ready'}
                </button>
              </div>
            )}
          </div>

          {/* Step 3: Post-Game */}
          <div className="border border-[#E8E8E8] rounded overflow-hidden bg-white">
            <button
              onClick={() => {}}
              disabled={!isGameReadyDone}
              className={`w-full p-4 flex items-start gap-3 transition-colors ${isPostGameDone ? 'bg-emerald-50' : isGameReadyDone ? 'hover:bg-zinc-50' : 'opacity-50'}`}
            >
              <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${isPostGameDone ? 'bg-emerald-500 text-white' : isGameReadyDone ? 'bg-blue-500 text-white' : 'bg-slate-300'}`}>
                {isPostGameDone ? '✓' : '3'}
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-zinc-900">Post-Game Report</p>
                {isPostGameDone && <p className="text-xs text-emerald-600 mt-1">Completed</p>}
              </div>
            </button>

            {isGameReadyDone && !isPostGameDone && (
              <div className="px-4 pb-4 border-t border-[#E8E8E8] space-y-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-2">Notes</label>
                  <textarea
                    value={postGameData.notes}
                    onChange={(e) => setPostGameData({ ...postGameData, notes: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500 text-sm"
                    rows={3}
                    placeholder="Any additional notes..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-900 mb-2">Incidents</label>
                  <textarea
                    value={postGameData.incidents}
                    onChange={(e) => setPostGameData({ ...postGameData, incidents: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500 text-sm"
                    rows={3}
                    placeholder="Report any incidents..."
                  />
                </div>
                <button
                  onClick={() => submitWorkflow('post_game_submitted')}
                  disabled={submitting || !selectedTech}
                  className="w-full bg-[#0A52EF] text-white py-3 rounded font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Submitting...' : 'Submit Post-Game Report'}
                </button>
              </div>
            )}
          </div>

          {/* Completion Message */}
          {isPostGameDone && (
            <div className="bg-emerald-50 border border-emerald-200 rounded p-4 text-center">
              <p className="text-sm font-medium text-emerald-700">All workflow steps completed</p>
              <p className="text-xs text-emerald-600 mt-1">Thank you for your work on this event</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
