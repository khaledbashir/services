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
  end_time: string | null
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

interface ViewerInfo {
  userId: string
  role: 'admin' | 'manager' | 'technician'
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
  const [viewer, setViewer] = useState<ViewerInfo | null>(null)
  const [postGameEditable, setPostGameEditable] = useState(true)
  const [postGameEditWindowEndsAt, setPostGameEditWindowEndsAt] = useState<string | null>(null)
  const [postGameFormOpen, setPostGameFormOpen] = useState(true)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [loadError, setLoadError] = useState<'forbidden' | 'not_found' | 'generic' | null>(null)
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
        if (res.status === 401) {
          // Not signed in — bounce to login and come back here after.
          // Slack deep links are the main entry point here; most users don't
          // have a session in the device/browser where Slack opened the link.
          const redirect = encodeURIComponent(`/workflow/${eventId}`)
          window.location.href = `/login?redirect=${redirect}`
          return
        }
        if (res.status === 403) {
          setLoadError('forbidden')
          return
        }
        if (res.status === 404) {
          setLoadError('not_found')
          return
        }
        if (!res.ok) {
          setLoadError('generic')
          return
        }
        const data = await res.json()
        setEvent(data.event)
        setWorkflow(data.workflow)
        setAssignedTechs(data.assignedTechs || [])
        setAllStaff(data.allStaff || [])
        setViewer(data.viewer || null)
        setPostGameEditable(data.postGameEditable !== false)
        setPostGameEditWindowEndsAt(data.postGameEditWindowEndsAt || null)
        setPostGameFormOpen(!data.workflow?.post_game_submitted)
        if (data.viewer?.role === 'technician' && data.viewer?.userId) {
          setSelectedTech(data.viewer.userId)
        } else if ((data.assignedTechs?.length || 0) > 0) {
          setSelectedTech(data.assignedTechs[0].id)
        } else if ((data.allStaff?.length || 0) > 0) {
          setSelectedTech(data.allStaff[0].id)
        }
        setPostGameData({
          notes: data.latestPostGameData?.notes || '',
          incidents: data.latestPostGameData?.incidents || '',
        })
      } catch (err) {
        console.error('Failed to fetch event:', err)
        setLoadError('generic')
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
          setPostGameFormOpen(false)
        }
      } else {
        const error = await res.json().catch(() => null)
        showToast(error?.error || 'Failed to submit', 'error')
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
    const errorHeadline =
      loadError === 'forbidden'
        ? 'You are not assigned to this event'
        : loadError === 'not_found'
        ? 'Event not found'
        : loadError === 'generic'
        ? 'Something went wrong loading this event'
        : 'Event not found'
    const errorDetail =
      loadError === 'forbidden'
        ? 'Ask your manager to add you to the assignment, then reopen the workflow link.'
        : loadError === 'not_found'
        ? 'This event may have been removed from the schedule. If you believe it still exists, notify ops.'
        : loadError === 'generic'
        ? 'Please try again in a moment. If this keeps happening, share the link with ops so they can investigate.'
        : null
    return (
      <div className="min-h-screen bg-white">
        <div className="h-12 bg-[#0A52EF]"></div>
        <div className="p-6 text-center py-12 max-w-md mx-auto">
          <p className="text-zinc-900 font-semibold">{errorHeadline}</p>
          {errorDetail && <p className="text-zinc-500 text-sm mt-2">{errorDetail}</p>}
        </div>
      </div>
    )
  }

  const isCheckInDone = workflow.checked_in !== null
  const isGameReadyDone = workflow.game_ready !== null
  const isPostGameDone = workflow.post_game_submitted !== null
  const canEditPostGame = isGameReadyDone && (!isPostGameDone || postGameEditable)
  const completedSteps = [isCheckInDone, isGameReadyDone, isPostGameDone].filter(Boolean).length
  const progressPercent = Math.round((completedSteps / 3) * 100)
  const nextStepLabel = !isCheckInDone ? 'Check-in' : !isGameReadyDone ? 'Game Ready' : !isPostGameDone ? 'Post-Game Report' : 'All steps complete'
  const postGameWindowLabel = postGameEditWindowEndsAt
    ? new Date(postGameEditWindowEndsAt).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Top bar */}
      <div className="bg-[#0A52EF] text-white py-3 px-4 fixed top-0 left-0 right-0 z-50">
        <p className="font-semibold">ANC Services</p>
      </div>

      <div className="pt-16 pb-8 px-4 max-w-2xl mx-auto">
        {/* Event Card */}
        <div className="bg-white rounded-[24px] shadow-sm border border-[#E8E8E8] p-4 mb-6 overflow-hidden relative">
          <div className="absolute inset-x-0 top-0 h-1 bg-zinc-100">
            <div className="h-full bg-[linear-gradient(90deg,#0A52EF_0%,#1F7BF2_100%)] transition-all" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <div className="pt-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em] text-[#0A52EF] font-semibold">Live Workflow</p>
                <h1 className="text-xl font-semibold text-zinc-900 mt-2">{event.summary}</h1>
                <p className="text-zinc-600 text-sm mt-1">{event.venue_name}</p>
              </div>
              {event.league && (
                <span className="inline-flex rounded-full bg-zinc-100 px-3 py-1 text-[11px] font-semibold text-zinc-600">
                  {event.league}
                </span>
              )}
            </div>
            <div className="flex gap-3 mt-4 text-xs text-zinc-500 flex-wrap">
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium">{formatDate(event.event_date)}</span>
              <span className="rounded-full bg-zinc-100 px-2.5 py-1 font-medium">{formatTime(event.start_time)}</span>
              <span className="rounded-full bg-[#0A52EF]/8 px-2.5 py-1 font-medium text-[#0A52EF]">{progressPercent}% complete</span>
            </div>
            <div className="mt-4 rounded-2xl bg-zinc-50 border border-zinc-200 px-3 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Next Step</p>
                <p className="text-sm font-semibold text-zinc-900 mt-1">{nextStepLabel}</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-zinc-500 font-semibold">Progress</p>
                <p className="text-sm font-semibold text-zinc-900 mt-1">{completedSteps} of 3</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tech Selector */}
        {viewer?.role === 'technician' ? (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-2xl p-4">
            <p className="text-sm font-medium text-blue-800">Assigned Workflow</p>
            <p className="text-xs text-blue-700 mt-1">
              This workflow is tied to your assignment, so you can check in and submit updates directly without choosing a technician.
            </p>
          </div>
        ) : (
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
        )}

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

            {canEditPostGame && (!isPostGameDone || postGameFormOpen) && (
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
                  {submitting ? 'Submitting...' : 'Submit post game ops report'}
                </button>
                {postGameWindowLabel && (
                  <p className="text-xs text-zinc-500">
                    Post-game reports stay editable until {postGameWindowLabel}.
                  </p>
                )}
              </div>
            )}

            {canEditPostGame && isPostGameDone && !postGameFormOpen && (
              <div className="px-4 pb-4 border-t border-[#E8E8E8] space-y-3">
                <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-3">
                  <p className="text-sm font-medium text-emerald-700">Post game ops report submitted</p>
                  {postGameWindowLabel && (
                    <p className="text-xs text-emerald-600 mt-1">
                      It can still be edited until {postGameWindowLabel}.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setPostGameFormOpen(true)}
                  className="w-full border border-slate-300 text-zinc-900 py-3 rounded font-medium hover:bg-zinc-50 transition-colors"
                >
                  Edit post game ops report
                </button>
              </div>
            )}
          </div>

          {isGameReadyDone && isPostGameDone && !postGameEditable && (
            <div className="rounded border border-zinc-200 bg-zinc-50 px-4 py-3 text-sm text-zinc-600">
              The 24-hour post-game editing window has ended{postGameWindowLabel ? ` (closed ${postGameWindowLabel})` : ''}.
            </div>
          )}

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
