'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useToast } from '@/components/toast'
import { useDictation, MicChip } from '@/components/dictation'
import { ATTACHMENT_ACCEPT } from '@/lib/ticket-attachments'

interface EventDetail {
  id: string
  summary: string
  venue_id: string
  venue_name: string
  league: string
  start_time: string
  end_time: string | null
  event_date: string
}

interface CreatedTicketSummary {
  id: string
  ticket_number: string | number
  title: string
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

  // Inline ticket reporting from the workflow page so techs can flag issues
  // mid-event without leaving the screen (Herve / Chris ask 2026-05-03).
  const [reportOpen, setReportOpen] = useState(false)
  const [reportSubmitting, setReportSubmitting] = useState(false)
  const [reportTitle, setReportTitle] = useState('')
  const [reportDescription, setReportDescription] = useState('')
  const [reportPriority, setReportPriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium')
  const [reportImage, setReportImage] = useState<{ data: string; mimeType: string; name: string } | null>(null)
  const [recentTickets, setRecentTickets] = useState<CreatedTicketSummary[]>([])

  const dictation = useDictation()
  const appendToTitle = (t: string) => setReportTitle(prev => (prev ? prev + ' ' : '') + t)
  const appendToDescription = (t: string) => setReportDescription(prev => (prev ? prev + ' ' : '') + t)

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 22 * 1024 * 1024) {
      showToast('File must be under 22 MB', 'error')
      e.target.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const mime = file.type || 'application/octet-stream'
      setReportImage({ data: result, mimeType: mime, name: file.name })
    }
    reader.readAsDataURL(file)
  }

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

  const submitReport = async () => {
    if (!event || !reportTitle.trim() || reportSubmitting) return
    dictation.stop()
    try {
      setReportSubmitting(true)
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: event.venue_id,
          event_id: event.id,
          title: reportTitle.trim(),
          description: reportDescription.trim() || `Reported from on-site workflow for ${event.summary}.`,
          priority: reportPriority,
          category: 'general',
          source: 'workflow',
          ticket_type: 'support',
          image: reportImage,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => null)
        showToast(err?.error || 'Could not create ticket', 'error')
        return
      }
      const data = await res.json()
      const created: CreatedTicketSummary = {
        id: data.ticket?.id || data.id,
        ticket_number: data.ticket?.ticket_number ?? data.ticket_number ?? '',
        title: reportTitle.trim(),
      }
      setRecentTickets(prev => [created, ...prev].slice(0, 5))
      setReportTitle('')
      setReportDescription('')
      setReportPriority('medium')
      setReportImage(null)
      setReportOpen(false)
      showToast('Ticket created', 'success')
    } catch (err) {
      console.error('Report submit failed:', err)
      showToast('Could not create ticket', 'error')
    } finally {
      setReportSubmitting(false)
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

        {/* Report Issue — always available so techs can flag problems any
            time during the event, not only after a workflow step. Creates a
            ticket scoped to this venue + event. */}
        <div className="mt-6 bg-white rounded-2xl border border-[#E8E8E8] shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setReportOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-zinc-50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3m0 4h.01M10.29 3.86l-8.18 14.16A2 2 0 003.85 21h16.3a2 2 0 001.74-2.98L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <p className="font-semibold text-zinc-900">Report an issue</p>
                <p className="text-xs text-zinc-500 mt-0.5">Create a ticket for this event or venue</p>
              </div>
            </div>
            <svg xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 text-zinc-400 transition-transform ${reportOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {reportOpen && (
            <div className="px-4 pb-4 border-t border-[#E8E8E8] space-y-3 pt-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-zinc-900">What's the issue?</label>
                  <MicChip id="workflow-title" dictation={dictation} append={appendToTitle} />
                </div>
                <input
                  type="text"
                  value={reportTitle}
                  onChange={(e) => setReportTitle(e.target.value)}
                  placeholder="e.g. Center hung scoreboard not powering on"
                  className="w-full p-3 border border-slate-300 rounded text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500 text-sm"
                  maxLength={200}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium text-zinc-900">Details (optional)</label>
                  <MicChip id="workflow-description" dictation={dictation} append={appendToDescription} />
                </div>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  rows={3}
                  placeholder="What happened, what you tried, anything ops should know."
                  className="w-full p-3 border border-slate-300 rounded text-zinc-900 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 focus:ring-slate-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900 mb-2">Attachment (optional)</label>
                {reportImage ? (
                  <div className="relative inline-block">
                    {reportImage.mimeType.startsWith('image/') ? (
                      <img src={reportImage.data} alt={reportImage.name} className="rounded border border-slate-200 max-h-40" />
                    ) : reportImage.mimeType.startsWith('video/') ? (
                      <video src={reportImage.data} controls className="rounded border border-slate-200 max-h-48 bg-black" />
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded border border-slate-200 bg-zinc-50">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="text-xs">
                          <p className="font-semibold text-zinc-900">{reportImage.name}</p>
                          <p className="text-zinc-500">{reportImage.mimeType}</p>
                        </div>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => setReportImage(null)}
                      className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-zinc-900/90 text-white text-xs flex items-center justify-center shadow"
                      aria-label="Remove attachment"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 w-full p-3 border border-dashed border-slate-300 rounded text-sm text-zinc-600 hover:bg-zinc-50 cursor-pointer">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.66-.9l.82-1.2A2 2 0 0110.07 4h3.86a2 2 0 011.66.9l.82 1.2a2 2 0 001.66.9H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <circle cx="12" cy="13" r="3" />
                    </svg>
                    Photo, video, PDF, or doc
                    <input
                      type="file"
                      accept={ATTACHMENT_ACCEPT}
                      onChange={onPickImage}
                      className="hidden"
                    />
                  </label>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-zinc-900 mb-2">Priority</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['low', 'medium', 'high', 'critical'] as const).map(p => {
                    const active = reportPriority === p
                    const tone = p === 'critical' ? 'border-red-300 text-red-700 bg-red-50'
                      : p === 'high' ? 'border-orange-300 text-orange-700 bg-orange-50'
                      : p === 'medium' ? 'border-amber-300 text-amber-700 bg-amber-50'
                      : 'border-zinc-300 text-zinc-700 bg-zinc-50'
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setReportPriority(p)}
                        className={`py-2 rounded text-xs font-semibold capitalize transition-colors border ${active ? tone : 'border-slate-300 text-zinc-600 hover:bg-zinc-50'}`}
                      >
                        {p}
                      </button>
                    )
                  })}
                </div>
              </div>

              <button
                type="button"
                onClick={submitReport}
                disabled={reportSubmitting || !reportTitle.trim()}
                className="w-full bg-[#0A52EF] text-white py-3 rounded font-medium hover:bg-[#0840C0] transition-colors disabled:opacity-50"
              >
                {reportSubmitting ? 'Creating ticket...' : 'Create ticket'}
              </button>
            </div>
          )}
        </div>

        {recentTickets.length > 0 && (
          <div className="mt-4 bg-white rounded-2xl border border-[#E8E8E8] shadow-sm p-4">
            <p className="text-xs uppercase tracking-wide text-zinc-500 font-semibold mb-2">Tickets you created</p>
            <ul className="space-y-1">
              {recentTickets.map(t => (
                <li key={t.id} className="text-sm">
                  <a href={`/tickets/${t.id}`} className="text-[#0A52EF] font-medium hover:underline">
                    {t.ticket_number ? `#${t.ticket_number} · ` : ''}{t.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
