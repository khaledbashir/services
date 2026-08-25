'use client'

import { useEffect, useRef, useState, FormEvent, ChangeEvent } from 'react'
import { useRouter } from 'next/navigation'
import { DashboardLayout } from '@/components/dashboard-layout'
import { InlineEdit } from '@/components/inline-edit'
import { Skeleton } from '@/components/skeleton'
import { TicketContent, CommentContent } from '@/components/ticket-content'
import { ATTACHMENT_ACCEPT } from '@/lib/ticket-attachments'
import { TICKET_CATEGORY_LABELS } from '@/lib/ticket-categories'
import { TicketCallContext } from '@/components/ticket-call-context'
import Link from 'next/link'

interface TicketDetail {
  id: string; ticket_number: number; title: string; description: string
  priority: string; status: string; category: string; subcategory?: string | null; resolution_notes: string | null
  event_id: string | null; event_name: string | null; venue_name: string; venue_id: string
  created_by: string; created_by_name: string; assigned_to_name: string | null; assigned_to: string | null
  assignees?: { id: string; full_name: string }[]
  created_date: string; updated_date: string; resolved_date: string | null
  merged_into_ticket_id?: string | null
  merged_into_ticket_number?: number | null
  merged_into_title?: string | null
  merged_from_numbers?: number[]
  sla_response_due: string | null; sla_resolution_due: string | null
  sla_response_met: boolean | null; sla_resolution_met: boolean | null
  first_response_at: string | null
  original_message: string | null
  source: string; ticket_type: string
  contact_name: string | null; contact_email: string | null; contact_phone: string | null
  venue_contact_email: string | null
  venue_distribution_emails: string[]
  parent_ticket_id: string | null; parent_ticket_number: number | null; parent_ticket_title: string | null
  sf_case_number: string | null
  image_url: string | null
}
interface Comment {
  id: string
  body: string
  is_internal: boolean
  author_id?: string | null
  author_name: string
  /** Set when the reply came through a client portal — carries who typed it. */
  author_email?: string | null
  is_portal?: boolean
  created_date: string
}
interface Activity { action: string; staff_id: string | null; details: any; created_at: string }
interface Staff { id: string; full_name: string }
interface TicketAttachment {
  id: string
  ticket_id?: string
  comment_id: string | null
  filename: string | null
  mime_type: string
  image_url: string
  caption: string | null
  is_internal: boolean
  uploaded_by?: string | null
  uploaded_by_name?: string | null
  created_date: string
}

/** A client reply typed into a portal, not an email and not an ANC note. */
function isPortalComment(comment: Comment) {
  return !comment.is_internal && comment.is_portal === true
}

function isTicketEmailComment(comment: Comment) {
  if (comment.is_internal) return false
  // A portal reply is attributed to the portal service account too, so it must
  // be ruled out before the service-account name is read as "this is an email".
  if (isPortalComment(comment)) return false
  return comment.author_name === 'ANC Bot'
    || /^Email (from|sent to)/i.test(comment.body || '')
    || /^Outbound email/i.test(comment.body || '')
}

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

function extractEmail(text: string | null | undefined) {
  return text?.match(emailPattern)?.[0]?.trim() || null
}

function extractInboundEmail(comment: Comment) {
  const body = comment.body || ''
  const fromHeader = body.match(/^Email from[^\n(]*\(([^)]+)\)/i)?.[1]
  return extractEmail(fromHeader) || extractEmail(body.match(/^From:\s*(.+)$/im)?.[1]) || null
}

/**
 * An ANC address is us, not the customer.
 *
 * A venue's distribution list can hold ANC staff only — Capital One Arena's held
 * one address, Jireh's own — and the composer showed it as a ready recipient
 * labelled "Ticket correspondent". Someone writing a client update there is
 * writing to themselves, sends it, and believes the client has been told. So the
 * addresses get classified and the composer says which kind it is about to mail.
 *
 * A warning, never a block: emailing the internal list deliberately is a normal
 * thing to want.
 */
const INTERNAL_EMAIL_DOMAINS = ['anc.com', 'ancsports.net']

function isInternalEmail(email: string) {
  const domain = email.trim().toLowerCase().split('@')[1] || ''
  return INTERNAL_EMAIL_DOMAINS.some(known => domain === known || domain.endsWith(`.${known}`))
}

const priorityConfig: Record<string, { color: string; label: string }> = {
  low: { color: 'text-zinc-500 bg-zinc-50 border-zinc-200', label: 'Low' },
  medium: { color: 'text-amber-700 bg-amber-50 border-amber-200', label: 'Medium' },
  high: { color: 'text-orange-700 bg-orange-50 border-orange-200', label: 'High' },
  critical: { color: 'text-red-700 bg-red-50 border-red-200', label: 'Critical' },
}
const statusSteps = [
  { key: 'new', label: 'New', color: '#3b82f6' },
  { key: 'on_hold', label: 'On Hold', color: '#8b5cf6' },
  { key: 'in_progress', label: 'In Progress', color: '#f59e0b' },
  { key: 'escalated', label: 'Escalated', color: '#ef4444' },
  { key: 'closed', label: 'Closed', color: '#6b7280' },
]
const categoryLabels: Record<string, string> = TICKET_CATEGORY_LABELS

/** An address this venue has corresponded with, offered for the list it is missing from. */
interface KnownVenueEmail {
  email: string
  timesUsed: number
  lastUsedAt: string | null
  lastSource: string | null
  internal: boolean
}

type TimelineFilter = 'all' | 'comments' | 'emails' | 'changes'
type ContentTab = 'timeline' | 'details' | 'description' | 'emails' | 'attachments' | 'notes'

export function TicketDetail({
  params,
  embedded = false,
  onClose,
}: {
  params: { id: string }
  embedded?: boolean
  onClose?: () => void
}) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [attachments, setAttachments] = useState<TicketAttachment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [relatedTickets, setRelatedTickets] = useState<any[]>([])
  const [staffList, setStaffList] = useState<Staff[]>([])
  const [showActions, setShowActions] = useState(false)
  const [loading, setLoading] = useState(true)
  const [newComment, setNewComment] = useState('')
  // Starts Internal and flips to Client once the ticket loads and we know the
  // venue has clients to send to (Chris D 7/29). Internal is the safe default
  // while loading — a note can never post client-visible by accident.
  const [isInternal, setIsInternal] = useState(true)
  const [visibilityTouched, setVisibilityTouched] = useState(false)
  const [hasClientAudience, setHasClientAudience] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<{ data: string; mimeType: string; name: string }[]>([])
  const [commentFileError, setCommentFileError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Surfaces what actually happened with the client email after a Client
  // comment is posted. Chris parity 5/13: External path was silently no-op
  // when the venue had no distribution list. This toast shows recipients
  // sent, "no list configured", or send failure.
  const [commentToast, setCommentToast] = useState<
    | { kind: 'emailed'; count: number }
    | { kind: 'no_list' }
    | { kind: 'send_failed' }
    | { kind: 'internal' }
    | { kind: 'closed' }
    | { kind: 'in_progress' }
    | null
  >(null)
  const [emailReply, setEmailReply] = useState('')
  // The composer lives behind the Emails tab, and that tab only carries a count
  // once a ticket already has email on it — so on a ticket raised in the
  // dashboard it looks like nothing and gets scanned straight past. The header
  // button below jumps here and puts the cursor in the box.
  const emailReplyRef = useRef<HTMLTextAreaElement>(null)
  const [newClientEmail, setNewClientEmail] = useState('')
  const [addingClientEmail, setAddingClientEmail] = useState(false)
  const [clientEmailError, setClientEmailError] = useState<string | null>(null)
  // Addresses this venue has corresponded with that are not on its list yet, so a
  // contact can be picked out of the venue's own history instead of retyped.
  const [knownEmails, setKnownEmails] = useState<KnownVenueEmail[]>([])
  const [showKnownEmails, setShowKnownEmails] = useState(false)
  const [removingClientEmail, setRemovingClientEmail] = useState<string | null>(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [emailStatus, setEmailStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [attachmentCaption, setAttachmentCaption] = useState('')
  const [attachmentInternal, setAttachmentInternal] = useState(false)
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [attachmentStatus, setAttachmentStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [editResolution, setEditResolution] = useState(false)
  const [resolutionNotes, setResolutionNotes] = useState('')
  const [cannedResponses, setCannedResponses] = useState<Array<{ id: string; title: string; body: string; category: string }>>([])
  const [showCanned, setShowCanned] = useState(false)
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionAnchor, setMentionAnchor] = useState<{ start: number; end: number }>({ start: 0, end: 0 })
  const [mentionHighlight, setMentionHighlight] = useState(0)
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all')
  const [activeTab, setActiveTab] = useState<ContentTab>('timeline')
  const [casePanelOpen, setCasePanelOpen] = useState(false)
  const [relatedPanelOpen, setRelatedPanelOpen] = useState(false)
  const [venueOptions, setVenueOptions] = useState<Array<{ id: string; name: string; client_name?: string | null }>>([])
  const [editingVenue, setEditingVenue] = useState(false)
  const [venueQuery, setVenueQuery] = useState('')
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [mergeQuery, setMergeQuery] = useState('')
  const [mergeCandidates, setMergeCandidates] = useState<Array<{ id: string; ticket_number: number; title: string; venue_name?: string | null }>>([])
  const [merging, setMerging] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [canManageAttachments, setCanManageAttachments] = useState(false)
  useEffect(() => {
    // Tightened 2026-04-23 at Chris D's ask: admin-only delete. Managers still
    // use "close" via the Mark Complete button — delete is irrecoverable.
    try {
      const role = localStorage.getItem('userRole')
      setUserRole(role)
      setCanDelete(role === 'admin')
      setCanManageAttachments(role === 'admin' || role === 'tech_support' || role === 'manager')
      setCurrentUserId(localStorage.getItem('userId'))
    } catch {}
  }, [])
  const router = useRouter()

  const fetchData = async () => {
    try {
      const [ticketRes, staffRes, venuesRes] = await Promise.all([
        fetch(`/api/tickets/${params.id}`),
        fetch('/api/staff'),
        fetch('/api/venues'),
      ])
      const ticketData = await ticketRes.json()
      const staffData = await staffRes.json()
      const venuesData = await venuesRes.json().catch(() => ({ venues: [] }))
      if (ticketData.ticket?.merged_into_ticket_id) {
        router.replace(`/tickets/${ticketData.ticket.merged_into_ticket_id}`)
        return
      }
      setTicket(ticketData.ticket)
      setComments(ticketData.comments || [])
      setAttachments(ticketData.attachments || [])
      setActivity(ticketData.activity || [])
      setRelatedTickets(ticketData.related_tickets || [])
      setStaffList(staffData.staff || [])
      setVenueOptions(venuesData.venues || [])
      setResolutionNotes(ticketData.ticket?.resolution_notes || '')
      setHasClientAudience(Boolean(ticketData.has_client_audience))
      // Only steer the default until the user picks for themselves — after
      // that their choice stands, including across refetches on this ticket.
      if (!visibilityTouched) setIsInternal(!ticketData.has_client_audience)
      const cannedRes = await fetch('/api/tickets/canned')
      if (cannedRes.ok) { const cd = await cannedRes.json(); setCannedResponses(cd.responses || []) }
    } catch (err) { console.error(err) }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchData() }, [params.id])

  // The venue's own correspondence history, reloaded whenever its list changes so a
  // just-added address leaves the suggestions and a just-removed one comes back.
  const venueId = ticket?.venue_id
  const distributionKey = (ticket?.venue_distribution_emails || []).join(',')
  useEffect(() => {
    if (!venueId) { setKnownEmails([]); return }
    let cancelled = false
    fetch(`/api/venues/${venueId}/known-emails`)
      .then(r => (r.ok ? r.json() : { emails: [] }))
      .then(d => { if (!cancelled) setKnownEmails(d.emails || []) })
      .catch(() => { if (!cancelled) setKnownEmails([]) })
    return () => { cancelled = true }
  }, [venueId, distributionKey])

  useEffect(() => {
    if (!showMergeModal) return
    fetch('/api/tickets?limit=500')
      .then(r => r.json())
      .then(d => setMergeCandidates((d.tickets || []).filter((t: any) => t.id !== params.id && t.status !== 'closed')))
      .catch(() => setMergeCandidates([]))
  }, [showMergeModal, params.id])

  const doMerge = async (targetId: string) => {
    if (merging) return
    if (!confirm('Merge this ticket into the selected one? This ticket will be closed and its comments moved to the target.')) return
    setMerging(true)
    try {
      const res = await fetch(`/api/tickets/${params.id}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_ticket_id: targetId }),
      })
      if (res.ok) {
        setShowMergeModal(false)
        router.push(`/tickets/${targetId}`)
      } else {
        const err = await res.json().catch(() => ({}))
        alert(err.error || 'Merge failed')
      }
    } finally {
      setMerging(false)
    }
  }

  const updateField = async (field: string, value: any) => {
    try {
      const res = await fetch(`/api/tickets/${params.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value })
      })
      if (res.ok) await fetchData()
    } catch {}
  }

  /**
   * Add a client address to the venue's list without leaving the ticket.
   *
   * Jireh asked for the client emails to be "more visible so you can see and add
   * more easily". They were neither: the ticket carries ONE contact_email, and
   * the list a reply actually goes to lives on the venue, three pages away,
   * showing here only as a "no list" badge. Writing it to the venue rather than
   * the ticket is the point — it fixes this ticket and every future one for that
   * venue, which is what he was describing.
   */
  const saveDistributionEmails = async (next: string[], failure: string): Promise<boolean> => {
    if (!ticket?.venue_id) {
      setClientEmailError('This ticket has no venue, so there is no list to change.')
      return false
    }
    try {
      const res = await fetch(`/api/venues/${ticket.venue_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distribution_emails: next }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setClientEmailError(err?.error || failure)
        return false
      }
      await fetchData()
      return true
    } catch {
      setClientEmailError(failure)
      return false
    }
  }

  const addClientEmail = async (e: FormEvent) => {
    e.preventDefault()
    const email = newClientEmail.trim()
    if (!email) return
    if (!ticket?.venue_id) {
      setClientEmailError('This ticket has no venue, so there is no list to add to.')
      return
    }
    if (!emailPattern.test(email)) {
      setClientEmailError('That does not look like an email address.')
      return
    }
    if (allDistributionEmails.some(existing => existing.toLowerCase() === email.toLowerCase())) {
      setClientEmailError('That address is already on the list.')
      return
    }
    setAddingClientEmail(true)
    setClientEmailError(null)
    const saved = await saveDistributionEmails(
      [...allDistributionEmails, email],
      'That address could not be saved.',
    )
    if (saved) setNewClientEmail('')
    setAddingClientEmail(false)
  }

  /**
   * Put an address the venue has written to before straight onto its list.
   *
   * The same save path as typing it, so an address picked here is a real list
   * entry — not a one-off recipient that disappears after this reply.
   */
  const pickKnownEmail = async (email: string) => {
    if (allDistributionEmails.some(existing => existing.toLowerCase() === email.toLowerCase())) return
    setAddingClientEmail(true)
    setClientEmailError(null)
    const saved = await saveDistributionEmails(
      [...allDistributionEmails, email],
      'That address could not be saved.',
    )
    if (saved) { setShowKnownEmails(false); setNewClientEmail('') }
    setAddingClientEmail(false)
  }

  /**
   * Take an address off the venue's list — the "way to edit list" half of the ask.
   *
   * Only addresses that came FROM the list can be removed. An address that is on
   * the ticket because someone wrote in from it is not ours to delete; it goes away
   * when the correspondence does.
   */
  const removeClientEmail = async (email: string) => {
    setRemovingClientEmail(email)
    setClientEmailError(null)
    await saveDistributionEmails(
      allDistributionEmails.filter(existing => existing.toLowerCase() !== email.toLowerCase()),
      'That address could not be removed.',
    )
    setRemovingClientEmail(null)
  }

  const addAssignee = async (staffId: string) => {
    if (!staffId) return
    try {
      const res = await fetch(`/api/tickets/${params.id}/assignees`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId })
      })
      if (res.ok) await fetchData()
    } catch {}
  }

  const removeAssignee = async (staffId: string) => {
    try {
      const res = await fetch(`/api/tickets/${params.id}/assignees?staff_id=${encodeURIComponent(staffId)}`, { method: 'DELETE' })
      if (res.ok) await fetchData()
    } catch {}
  }

  // A tech can delete their own note; admins/managers can delete any.
  const canDeleteComment = (c: Comment) =>
    !!c.id && (((currentUserId && c.author_id === currentUserId) as boolean) || userRole === 'admin' || userRole === 'manager')

  const deleteComment = async (commentId: string) => {
    if (!confirm('Delete this note? It will be removed from the timeline. This can\'t be undone from here.')) return
    try {
      const res = await fetch(`/api/tickets/${params.id}/comments/${commentId}`, { method: 'DELETE' })
      if (res.ok) await fetchData()
      else { const d = await res.json().catch(() => null); alert(d?.error || 'Could not delete this note.') }
    } catch {}
  }

  const onCommentChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setNewComment(value)
    const caret = e.target.selectionStart || value.length
    const before = value.slice(0, caret)
    const match = before.match(/(?:^|\s)@([\w.\- ]{0,40})$/)
    if (match) {
      setMentionQuery(match[1])
      setMentionAnchor({ start: caret - match[1].length - 1, end: caret })
      setMentionHighlight(0)
    } else {
      setMentionQuery(null)
    }
  }

  const filteredMentionStaff = mentionQuery === null
    ? []
    : staffList
        .filter(s => s.full_name.toLowerCase().includes(mentionQuery.toLowerCase()))
        .slice(0, 6)

  const insertMention = (staff: Staff) => {
    const before = newComment.slice(0, mentionAnchor.start)
    const after = newComment.slice(mentionAnchor.end)
    const inserted = `@[${staff.full_name}] `
    const next = before + inserted + after
    setNewComment(next)
    setMentionQuery(null)
    setTimeout(() => {
      const ta = commentTextareaRef.current
      if (ta) {
        const pos = (before + inserted).length
        ta.focus()
        ta.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  const onCommentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery === null || filteredMentionStaff.length === 0) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setMentionHighlight(h => Math.min(h + 1, filteredMentionStaff.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(filteredMentionStaff[mentionHighlight]) }
    else if (e.key === 'Escape') { setMentionQuery(null) }
  }

  // One-click post-plus-status (Chris D): 'close' (7/14) posts the note and
  // closes; 'in_progress' (7/15) posts the note and moves New/On Hold forward.
  // Either way the team gets a single Slack notification instead of two.
  const addComment = async (e: FormEvent, statusAction?: 'close' | 'in_progress') => {
    e.preventDefault()
    // A screenshot on its own is a valid post — don't require text (Chris D 7/29).
    if (!newComment.trim() && pendingFiles.length === 0) return
    setSubmitting(true)
    setCommentToast(null)
    try {
      const res = await fetch(`/api/tickets/${params.id}/comments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: newComment,
          is_internal: isInternal,
          close_ticket: statusAction === 'close',
          set_status: statusAction === 'in_progress' ? 'in_progress' : undefined,
          attachments: pendingFiles,
        })
      })
      if (res.ok) {
        const data = await res.json().catch(() => null)
        const email = data?.email
        if (data?.closed) {
          setCommentToast({ kind: 'closed' })
        } else if (data?.moved_in_progress) {
          setCommentToast({ kind: 'in_progress' })
        } else if (isInternal) {
          setCommentToast({ kind: 'internal' })
        } else if (email?.sent) {
          setCommentToast({ kind: 'emailed', count: email.recipient_count || 0 })
        } else if (email?.reason === 'no_list') {
          setCommentToast({ kind: 'no_list' })
        } else {
          setCommentToast({ kind: 'send_failed' })
        }
        setNewComment('')
        setPendingFiles([])
        await fetchData()
        // Auto-clear after 8s; user can dismiss earlier via the X.
        setTimeout(() => setCommentToast(null), 8000)
      }
    } catch {} finally { setSubmitting(false) }
  }

  const sendEmailReply = async (e: FormEvent) => {
    e.preventDefault()
    if (!emailReply.trim()) return
    setSendingEmail(true)
    setEmailStatus(null)
    try {
      const res = await fetch(`/api/tickets/${params.id}/email-reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: emailReply }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setEmailReply('')
        setEmailStatus({ type: 'success', message: `Email sent from ${data?.from || 'support@anc.com'} to ${data?.to || 'the ticket contact'}` })
        await fetchData()
      } else {
        setEmailStatus({ type: 'error', message: data?.error || 'Email could not be sent' })
      }
    } catch {
      setEmailStatus({ type: 'error', message: 'Email could not be sent' })
    } finally {
      setSendingEmail(false)
    }
  }

  // Files staged on the composer, posted together with the note so the note and
  // its screenshots land as one entry in the feed (Chris D 7/29).
  const stageFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    setCommentFileError(null)
    const staged: { data: string; mimeType: string; name: string }[] = []
    for (const file of Array.from(fileList)) {
      if (file.size > 22 * 1024 * 1024) {
        setCommentFileError(`${file.name} is over 22 MB`)
        continue
      }
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result || ''))
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        staged.push({ data: dataUrl, mimeType: file.type, name: file.name })
      } catch {
        setCommentFileError(`Could not read ${file.name}`)
      }
    }
    if (staged.length) setPendingFiles(prev => [...prev, ...staged])
  }

  // Screenshot paste — the fastest path for what Chris actually does.
  const onCommentPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length === 0) return
    e.preventDefault()
    const dt = new DataTransfer()
    files.forEach(f => dt.items.add(f))
    stageFiles(dt.files)
  }

  const uploadAttachment = async (file: File | null) => {
    if (!file) return
    if (file.size > 22 * 1024 * 1024) {
      setAttachmentStatus({ type: 'error', message: 'File must be under 22 MB' })
      return
    }
    setUploadingAttachment(true)
    setAttachmentStatus(null)
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result || ''))
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      const res = await fetch(`/api/tickets/${params.id}/attachments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attachment: { data: dataUrl, mimeType: file.type, name: file.name },
          caption: attachmentCaption,
          is_internal: attachmentInternal,
        }),
      })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setAttachmentCaption('')
        setAttachmentStatus({ type: 'success', message: 'Attachment added' })
        await fetchData()
      } else {
        setAttachmentStatus({ type: 'error', message: data?.error || 'Unable to upload attachment' })
      }
    } catch {
      setAttachmentStatus({ type: 'error', message: 'Unable to upload attachment' })
    } finally {
      setUploadingAttachment(false)
    }
  }

  const deleteAttachment = async (attachment: TicketAttachment) => {
    const label = attachment.caption || attachment.filename || 'this attachment'
    if (!confirm(`Delete ${label}? This can't be undone.`)) return
    try {
      const res = await fetch(`/api/tickets/${params.id}/attachments/${attachment.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => null)
      if (res.ok) {
        setAttachmentStatus({ type: 'success', message: 'Attachment deleted' })
        await fetchData()
      } else {
        setAttachmentStatus({ type: 'error', message: data?.error || 'Could not delete attachment' })
      }
    } catch {
      setAttachmentStatus({ type: 'error', message: 'Could not delete attachment' })
    }
  }

  const saveResolution = async () => {
    await updateField('resolution_notes', resolutionNotes)
    setEditResolution(false)
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?'
    const p = name.split(' ')
    return (p[0]?.[0] + (p[1]?.[0] || '')).toUpperCase()
  }

  if (loading) return (
    <TicketFrame embedded={embedded}>
      <div className="max-w-6xl mx-auto space-y-6 py-2">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-14 w-full" />
        <div className="flex gap-8"><Skeleton className="h-96 w-80" /><Skeleton className="h-96 flex-1" /></div>
      </div>
    </TicketFrame>
  )
  if (!ticket) return (
    <TicketFrame embedded={embedded}>
      <div className="max-w-6xl mx-auto py-20 text-center">
        <p className="text-zinc-400 text-sm">Ticket not found</p>
      </div>
    </TicketFrame>
  )

  const pri = priorityConfig[ticket.priority] || priorityConfig.medium
  const currentStepIdx = statusSteps.findIndex(s => s.key === ticket.status)
  const caseNum = `T-${ticket.ticket_number}`
  const isVoicemailTicket = ticket.source === 'voicemail'
  const voicemailRecordingUrl = isVoicemailTicket
    ? ticket.description?.match(/(?:^|\n)Listen:\s*(https?:\/\/\S+)/)?.[1] || null
    : null

  const allTimelineItems: Array<{ type: 'comment' | 'email' | 'change'; data: any; time: Date }> = []
  comments.forEach(c => {
    const isEmail = isTicketEmailComment(c)
    allTimelineItems.push({ type: isEmail ? 'email' : 'comment', data: c, time: new Date(c.created_date) })
  })
  activity.forEach(a => allTimelineItems.push({ type: 'change', data: a, time: new Date(a.created_at) }))
  allTimelineItems.sort((a, b) => a.time.getTime() - b.time.getTime())

  const filteredTimeline = timelineFilter === 'all' ? allTimelineItems
    : timelineFilter === 'comments' ? allTimelineItems.filter(i => i.type === 'comment')
    : timelineFilter === 'emails' ? allTimelineItems.filter(i => i.type === 'email')
    : allTimelineItems.filter(i => i.type === 'change')

  const filterCounts = {
    all: allTimelineItems.length,
    comments: comments.filter(c => !isTicketEmailComment(c)).length,
    emails: comments.filter(c => isTicketEmailComment(c)).length,
    changes: activity.length,
  }
  const communicationCount = filterCounts.emails + (ticket.original_message ? 1 : 0)
  const emailTimelineItems = allTimelineItems.filter(i => i.type === 'email')
  const latestInboundEmail = [...comments]
    .reverse()
    .map(extractInboundEmail)
    .find(Boolean) || null
  const allDistributionEmails = Array.isArray(ticket.venue_distribution_emails)
    ? ticket.venue_distribution_emails.filter(email => email && email.includes('@'))
    : []
  // Mirror the email-reply route: a reply goes to whoever is actually
  // corresponding (latest inbound) plus the venue's distribution list; the
  // single stored contact is only a fallback when there is no real recipient.
  //
  // Each address keeps where it came from. The old label was derived from the
  // COUNT — one address read as "Ticket correspondent" even when it came from
  // the venue list and nobody had corresponded at all.
  const recipientSources: { email: string; source: string }[] = []
  const seenRecipients = new Set<string>()
  const addRecipient = (email: string | null | undefined, source: string) => {
    if (!email || !email.includes('@')) return
    const key = email.trim().toLowerCase()
    if (seenRecipients.has(key)) return
    seenRecipients.add(key)
    recipientSources.push({ email: email.trim(), source })
  }
  addRecipient(latestInboundEmail, 'Ticket correspondent')
  allDistributionEmails.forEach(email => addRecipient(email, 'Venue contact list'))

  const replyRecipients = recipientSources.map(r => r.email)
  const replyTarget = recipientSources.length
    ? {
        email: replyRecipients.join(', '),
        source: Array.from(new Set(recipientSources.map(r => r.source))).join(' + '),
      }
    : ticket.contact_email
      ? { email: ticket.contact_email, source: 'Ticket contact' }
      : ticket.venue_contact_email
        ? { email: ticket.venue_contact_email, source: 'Venue primary contact' }
        : extractEmail(ticket.original_message) || extractEmail(ticket.description)
          ? { email: (extractEmail(ticket.original_message) || extractEmail(ticket.description))!, source: 'Original message' }
          : null

  // Who this reply would actually land on, split into people at ANC and people
  // outside it, so the composer can say so before anything is sent.
  const replyTargetEmails = replyTarget
    ? replyTarget.email.split(',').map(e => e.trim()).filter(Boolean)
    : []
  const externalRecipients = replyTargetEmails.filter(email => !isInternalEmail(email))
  const internalRecipients = replyTargetEmails.filter(isInternalEmail)
  const noClientRecipient = replyTargetEmails.length > 0 && externalRecipients.length === 0
  const mixedRecipients = internalRecipients.length > 0 && externalRecipients.length > 0
  const recipientReady = replyTargetEmails.length > 0 && !noClientRecipient
  // One row per address, each keeping its own provenance. The fallback chain
  // only ever yields a single address, so it becomes a one-row list.
  const replyTargetDetails = recipientSources.length
    ? recipientSources
    : replyTarget
      ? [{ email: replyTarget.email, source: replyTarget.source }]
      : []
  const displayAttachments: TicketAttachment[] = [
    ...(ticket.image_url ? [{
      id: 'original-ticket-image',
      comment_id: null,
      filename: 'Original ticket image',
      mime_type: 'image/jpeg',
      image_url: ticket.image_url,
      caption: 'Original image submitted with this ticket',
      is_internal: false,
      uploaded_by_name: ticket.created_by_name,
      created_date: ticket.created_date,
    }] : []),
    ...attachments,
  ]

  return (
    <TicketFrame embedded={embedded}>
      <div
        className={`${embedded ? 'px-5' : 'max-w-[1440px] mx-auto'} space-y-5 py-4`}
        data-ai-page-context
        data-ai-record-type="ticket"
        data-ai-record-id={ticket.id}
        data-ai-record-number={caseNum}
        data-ai-record-title={ticket.title}
        data-ai-record-status={ticket.status}
        data-ai-record-priority={ticket.priority}
        data-ai-assignee-id={ticket.assigned_to || undefined}
        data-ai-assignee-name={ticket.assigned_to_name || undefined}
        data-ai-venue-id={ticket.venue_id || undefined}
        data-ai-venue-name={ticket.venue_name || undefined}
      >

        {ticket.merged_into_ticket_id && ticket.merged_into_ticket_number && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex items-center justify-between">
            <span>This ticket was merged into <span className="font-semibold">T-{String(ticket.merged_into_ticket_number).padStart(5, '0')}</span>. Continue the conversation there.</span>
            <Link href={`/tickets/${ticket.merged_into_ticket_id}`} className="text-amber-900 font-medium underline">Open primary →</Link>
          </div>
        )}
        {!!(ticket.merged_from_numbers?.length) && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Merged from: {ticket.merged_from_numbers.map((n) => `T-${String(n).padStart(5, '0')}`).join(', ')}
          </div>
        )}

        {/* Which venue this caller has reached us about before, and which past
            tickets sound like what they just said. Renders nothing when there
            is nothing to say. */}
        <TicketCallContext ticketId={ticket.id} venueId={ticket.venue_id} />

        {/*
          Print sheet — never on screen, the only thing on paper.

          Built separately rather than by restyling the page because the page is
          tabbed: whatever is printed would otherwise depend on which tab happens
          to be open. And because this goes to a customer, it is client-safe by
          construction — internal notes are filtered out here, not hidden by CSS
          someone can undo later.
        */}
        <div className="ticket-print-sheet hidden">
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '2px solid #0A52EF', paddingBottom: 10, marginBottom: 18 }}>
            <img src="/ANC_Logo_2023_blue.png" alt="ANC" style={{ width: 132, height: 'auto' }} />
            <div style={{ textAlign: 'right', fontSize: 11, color: '#6B7280', lineHeight: 1.5 }}>
              <div style={{ fontWeight: 600, color: '#111827', fontSize: 13 }}>Service Ticket {caseNum}</div>
              <div>{ticket.venue_name || 'ANC Support'}</div>
            </div>
          </div>

          <h1 style={{ fontSize: 19, fontWeight: 600, margin: '0 0 14px', lineHeight: 1.3 }}>{ticket.title}</h1>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, marginBottom: 18 }} className="print-avoid-break">
            <tbody>
              {[
                ['Status', statusSteps.find(s => s.key === ticket.status)?.label || ticket.status],
                ['Priority', pri.label],
                ['Category', categoryLabels[ticket.category] || ticket.category || '—'],
                ['Opened', `${ticket.created_date} by ${ticket.created_by_name}`],
                ['Assigned to', ticket.assigned_to_name || 'Unassigned'],
                ['Site contact', [ticket.contact_name, ticket.contact_email, ticket.contact_phone].filter(Boolean).join(' · ') || '—'],
              ].map(([label, value]) => (
                <tr key={label as string}>
                  <td style={{ padding: '5px 12px 5px 0', color: '#6B7280', width: 110, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{label}</td>
                  <td style={{ padding: '5px 0', color: '#111827', fontWeight: 500 }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {(ticket.description || ticket.original_message) && (
            <div className="print-avoid-break" style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0A52EF', marginBottom: 6 }}>Reported issue</div>
              <div style={{ fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ticket.description || ticket.original_message}</div>
            </div>
          )}

          {(() => {
            const shareable = comments.filter(c => !c.is_internal && (c.body || '').trim())
            if (!shareable.length) return null
            return (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0A52EF', marginBottom: 6 }}>Updates</div>
                {shareable.map(c => (
                  <div key={c.id} className="print-avoid-break" style={{ borderLeft: '2px solid #DDE3EE', paddingLeft: 10, margin: '0 0 10px' }}>
                    <div style={{ fontSize: 10, color: '#6B7280', marginBottom: 2 }}>{c.author_name} · {c.created_date}</div>
                    <div style={{ fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{c.body}</div>
                  </div>
                ))}
              </div>
            )
          })()}

          {resolutionNotes && (
            <div className="print-avoid-break" style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: '#0A52EF', marginBottom: 6 }}>Resolution</div>
              <div style={{ fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{resolutionNotes}</div>
            </div>
          )}

          <div style={{ borderTop: '1px solid #DDE3EE', paddingTop: 8, fontSize: 10, color: '#6B7280', display: 'flex', justifyContent: 'space-between' }}>
            <span>ANC Sports Enterprises · www.anc.com · (914) 696-2100</span>
            <span>{caseNum}</span>
          </div>
        </div>

        {/* ── Header ── */}
        <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5 space-y-4">
          <button onClick={() => embedded ? onClose?.() : router.push('/tickets')} className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors flex items-center gap-1.5 group">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 group-hover:-translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            Tickets
          </button>
          <div className="flex flex-col xl:flex-row xl:items-start gap-4">
            <span className="text-xs font-mono font-semibold text-zinc-500 bg-zinc-100 px-2.5 py-1.5 rounded-md w-fit flex-shrink-0">{caseNum}</span>
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-semibold text-zinc-900 leading-tight">
                <InlineEdit value={ticket.title} onSave={v => updateField('title', v)} displayClassName="text-xl font-semibold text-zinc-900" />
              </h1>
              <div className="flex items-center gap-2 mt-2 text-xs text-zinc-400 flex-wrap">
                <span>Opened by <span className="text-zinc-600 font-medium">{ticket.created_by_name}</span></span>
                <span>/</span>
                <span>{ticket.created_date}</span>
                {ticket.venue_name && (
                  <>
                    <span>/</span>
                    <Link href={`/venues/${ticket.venue_id}`} className="text-blue-600 hover:text-blue-800 font-medium">{ticket.venue_name}</Link>
                  </>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 text-[10px] font-semibold">{(ticket.source || 'web').toUpperCase()}</span>
                <span data-ai-target="ticket-priority-summary" className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pri.color}`}>{pri.label}</span>
                <span data-ai-target="ticket-owner-summary" className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-semibold">
                  Owner: {ticket.assigned_to_name || 'Unassigned'}
                </span>
              </div>
              {ticket.image_url && (
                <div className="mt-2">
                  <img src={ticket.image_url} alt="Issue" className="h-20 w-32 object-cover rounded-lg border border-zinc-200 cursor-pointer hover:opacity-80 transition-opacity" onClick={() => window.open(ticket.image_url!, '_blank')} />
                </div>
              )}
            </div>
            {/* Action buttons — SF style */}
            <div className="flex items-center gap-2 flex-shrink-0 xl:ml-auto">
              {!isVoicemailTicket && (
                <button
                  data-ai-target="ticket-email-client"
                  onClick={() => {
                    setActiveTab('emails')
                    // After the tab renders, not before it.
                    requestAnimationFrame(() => {
                      emailReplyRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                      emailReplyRef.current?.focus()
                    })
                  }}
                  title={
                    replyTarget
                      ? noClientRecipient
                        ? `Only ANC addresses on file: ${replyTarget.email}`
                        : `Replies to ${replyTarget.email}`
                      : 'No contact email on this ticket yet'
                  }
                  className="px-3 py-2 bg-[#0A52EF] text-white rounded-lg text-xs font-semibold hover:bg-[#0840C0] transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                  Email Client
                  {(!replyTarget || noClientRecipient) && (
                    <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-amber-300" aria-hidden="true"></span>
                  )}
                </button>
              )}
              {ticket.status !== 'closed' && (
                <button
                  data-ai-target="ticket-mark-complete"
                  onClick={() => updateField('status', 'closed')}
                  className="px-3 py-2 bg-emerald-600 text-white rounded-lg text-xs font-semibold hover:bg-emerald-700 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  Mark Complete
                </button>
              )}
              {canDelete && (
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ticket #${ticket.ticket_number}? This can't be undone — use for spam only.`)) return
                    try {
                      const res = await fetch(`/api/tickets/${params.id}`, { method: 'DELETE' })
                      if (!res.ok) {
                        const err = await res.json().catch(() => ({}))
                        alert(err.error || `Delete failed (${res.status})`)
                        return
                      }
                      if (embedded) onClose?.()
                      else router.push('/tickets')
                    } catch (err) {
                      alert('Delete failed — see console')
                      console.error(err)
                    }
                  }}
                  title="Delete this ticket (manager+ only, for spam)"
                  className="px-3 py-2 bg-white border border-red-200 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-50 transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a2 2 0 012-2h2a2 2 0 012 2v3" /></svg>
                  Delete
                </button>
              )}
              {/* Send to Slack + Actions dropdown */}
              <div className="relative">
                <div className="flex">
                  <button
                    onClick={async () => {
                      try {
                        await fetch(`/api/tickets/${params.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ status: ticket.status }),
                        })
                      } catch {}
                    }}
                    className="px-3 py-2 bg-[#0A52EF] text-white text-xs font-semibold rounded-l-lg hover:bg-[#0840C0] transition-colors shadow-sm"
                  >
                    Send to Slack
                  </button>
                  <button
                    onClick={() => setShowActions(!showActions)}
                    className="px-2 py-2 bg-[#0A52EF] text-white rounded-r-lg hover:bg-[#0840C0] transition-colors border-l border-blue-400/30"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
                  </button>
                </div>
                {showActions && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowActions(false)} />
                    <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-zinc-200 py-1 z-50">
                      {[
                        { label: 'Change Owner', action: () => { document.querySelector<HTMLSelectElement>('[data-assignee-select]')?.focus(); setShowActions(false) } },
                        { label: 'Clone Ticket', action: async () => {
                          const res = await fetch('/api/tickets', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ venue_id: ticket.venue_id, title: `[Clone] ${ticket.title}`, description: ticket.description, priority: ticket.priority, category: ticket.category, source: ticket.source, ticket_type: ticket.ticket_type, parent_ticket_id: ticket.id }),
                          })
                          if (res.ok) { const d = await res.json(); router.push(`/tickets/${d.id}`) }
                          setShowActions(false)
                        }},
                        { label: 'Create Dev Ticket', action: async () => {
                          const res = await fetch('/api/tickets', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ venue_id: ticket.venue_id, title: `[Dev] ${ticket.title}`, description: ticket.description, priority: ticket.priority, category: ticket.category, ticket_type: 'dev_ticket', parent_ticket_id: ticket.id }),
                          })
                          if (res.ok) { const d = await res.json(); router.push(`/tickets/${d.id}`) }
                          setShowActions(false)
                        }},
                        { label: 'Merge into another ticket…', action: () => { setShowActions(false); setShowMergeModal(true) } },
                        { label: 'Print View', action: () => { window.print(); setShowActions(false) } },
                      ].map((item, i) => (
                        <button key={i} onClick={item.action}
                          className="w-full text-left px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 transition-colors">
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Status Steps ── */}
        <div data-ai-target="ticket-status" className="bg-white rounded-xl border border-zinc-200 p-3 shadow-sm">
        <div className="flex items-center gap-1">
          {statusSteps.map((step, idx) => {
            const isActive = step.key === ticket.status
            const isPast = idx < currentStepIdx
            return (
              <button key={step.key} data-ai-target={`ticket-status-${step.key}`} onClick={() => updateField('status', step.key)}
                className="flex-1 group" title={`Set to ${step.label}`}>
                <div className={`h-1.5 rounded-full transition-all ${isActive ? 'scale-y-150' : 'group-hover:scale-y-125'}`}
                  style={{ backgroundColor: isActive ? step.color : isPast ? step.color + '60' : 'var(--anc-subtle)' }} />
                <p className={`text-[10px] font-medium mt-1.5 text-center transition-colors ${isActive ? 'text-zinc-900' : isPast ? 'text-zinc-500' : 'text-zinc-300'}`}>
                  {step.label}
                </p>
              </button>
            )
          })}
        </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            data-ai-target="ticket-case-panel"
            onClick={() => setCasePanelOpen(open => !open)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${
              casePanelOpen
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h16" />
            </svg>
            Case Panel
          </button>
          <button
            type="button"
            onClick={() => setRelatedPanelOpen(open => !open)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-semibold transition-colors ${
              relatedPanelOpen
                ? 'border-blue-200 bg-blue-50 text-blue-700'
                : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-800'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8M8 12h8M8 17h8M4 7h.01M4 12h.01M4 17h.01" />
            </svg>
            Related Panel
          </button>
        </div>

        {/* ── Focusable Ticket Workspace ── */}
        <div className="flex flex-col lg:flex-row gap-5">

          {/* ── LEFT SIDEBAR ── */}
          {casePanelOpen && <div className="w-full lg:w-72 lg:min-w-[272px] flex-shrink-0 space-y-6 lg:sticky lg:top-4 self-start bg-white rounded-xl border border-zinc-200 p-5 shadow-sm">

            {/* Details */}
            <div className="space-y-5">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Details</h3>

              <div>
                <label className="text-[11px] text-zinc-400 font-medium block mb-1.5">Assignees</label>
                {(ticket.assignees && ticket.assignees.length > 0) ? (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {ticket.assignees.map(a => (
                      <span key={a.id}
                        className={`inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-0.5 text-[11px] font-medium border ${
                          a.id === ticket.assigned_to ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                        }`}
                        title={a.id === ticket.assigned_to ? 'Primary owner' : 'Assignee'}>
                        {a.full_name}
                        <button type="button" onClick={() => removeAssignee(a.id)} aria-label={`Remove ${a.full_name}`}
                          className="ml-0.5 h-4 w-4 inline-flex items-center justify-center rounded-full text-current/50 hover:text-current hover:bg-black/5">×</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-zinc-400 mb-2">Unassigned</p>
                )}
                <select data-assignee-select data-ai-target="ticket-assignee" aria-label="Add ticket assignee" value="" onChange={e => { const v = e.target.value; e.target.value = ''; addAssignee(v) }}
                  className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-500 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300 outline-none bg-white transition-colors">
                  <option value="">+ Add tech…</option>
                  {staffList.filter(s => !(ticket.assignees || []).some(a => a.id === s.id)).map(s => (
                    <option key={s.id} value={s.id}>{s.full_name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 font-medium block mb-1.5">Priority</label>
                <div data-ai-target="ticket-priority" className="grid grid-cols-4 gap-1.5">
                  {Object.entries(priorityConfig).map(([key, cfg]) => (
                    <button key={key} data-ai-target={`ticket-priority-${key}`} onClick={() => updateField('priority', key)}
                      className={`text-[11px] font-medium py-1.5 rounded-md transition-all text-center border ${ticket.priority === key ? cfg.color : 'text-zinc-400 bg-white border-zinc-200 hover:border-zinc-300'}`}>
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] text-zinc-400 font-medium block mb-1.5">Category</label>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(categoryLabels).map(([key, label]) => (
                    <button key={key} onClick={() => updateField('category', key)}
                      className={`text-[11px] font-medium px-3 py-1.5 rounded-md transition-all border ${ticket.category === key ? 'text-zinc-900 bg-zinc-100 border-zinc-300' : 'text-zinc-400 bg-white border-zinc-200 hover:border-zinc-300'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Case Information — SF-style two-column grid */}
            <div className="space-y-3 pt-5 border-t border-zinc-100">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Case Information</h3>
              {/* Editable Venue row: shows current venue, click to change (supports voicemail tickets landing unassigned) */}
              <div className="py-1.5 px-2 rounded hover:bg-zinc-50 group transition-colors relative">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-zinc-400 flex-shrink-0">Venue</span>
                  <div className="flex items-center gap-2 ml-4 min-w-0">
                    {ticket.venue_id && ticket.venue_name ? (
                      <Link href={`/venues/${ticket.venue_id}`} className="text-blue-600 hover:text-blue-800 font-medium truncate">{ticket.venue_name}</Link>
                    ) : (
                      <span className="text-zinc-400 italic">Not linked</span>
                    )}
                    <button
                      type="button"
                      onClick={() => { setEditingVenue(!editingVenue); setVenueQuery('') }}
                      className="opacity-0 group-hover:opacity-100 text-[10px] text-blue-600 hover:text-blue-800 transition-opacity"
                    >
                      {editingVenue ? 'Cancel' : (ticket.venue_id ? 'Change' : 'Link')}
                    </button>
                  </div>
                </div>
                {editingVenue && (
                  <div className="mt-2">
                    <input
                      type="text"
                      autoFocus
                      value={venueQuery}
                      onChange={(e) => setVenueQuery(e.target.value)}
                      placeholder="Type to search venues..."
                      className="w-full border border-zinc-300 px-2 py-1.5 text-xs focus:ring-1 focus:ring-blue-500 outline-none rounded"
                    />
                    <div className="max-h-48 overflow-auto mt-1 border border-zinc-200 rounded bg-white">
                      {venueOptions
                        .filter(v => v.name.toLowerCase().includes(venueQuery.toLowerCase().trim()))
                        .slice(0, 40)
                        .map(v => (
                          <button
                            type="button"
                            key={v.id}
                            onClick={async () => {
                              await updateField('venue_id', v.id)
                              setEditingVenue(false)
                              setVenueQuery('')
                            }}
                            className={`w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 ${ticket.venue_id === v.id ? 'bg-blue-50 text-blue-700' : 'text-zinc-700'}`}
                          >
                            {v.name}
                            {v.client_name && <span className="text-zinc-400 ml-2">· {v.client_name}</span>}
                          </button>
                        ))}
                      {venueOptions.filter(v => v.name.toLowerCase().includes(venueQuery.toLowerCase().trim())).length === 0 && (
                        <div className="px-2 py-2 text-xs text-zinc-400">No venues match "{venueQuery}"</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {[
                  ticket.event_name ? { label: 'Event', value: ticket.event_name, href: `/events/${ticket.event_id}` } : null,
                  { label: 'Source', value: (ticket.source || 'web').replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) },
                  { label: 'Type', value: (ticket.ticket_type || 'support').replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()) },
                  ticket.sf_case_number ? { label: 'SF Case #', value: ticket.sf_case_number } : null,
                  ticket.parent_ticket_number ? { label: 'Parent Case', value: `T-${String(ticket.parent_ticket_number).padStart(5, '0')}`, href: `/tickets/${ticket.parent_ticket_id}` } : null,
                  { label: 'Created by', value: ticket.created_by_name, href: `/staff/${ticket.created_by}` },
                  { label: 'Created', value: ticket.created_date },
                  { label: 'Updated', value: ticket.updated_date },
                  ticket.resolved_date ? { label: 'Closed', value: ticket.resolved_date } : null,
                ].filter(Boolean).map((item: any, i) => (
                  <div key={i} className="flex justify-between items-center text-xs py-1.5 px-2 rounded hover:bg-zinc-50 group transition-colors">
                    <span className="text-zinc-400 flex-shrink-0">{item.label}</span>
                    <div className="flex items-center gap-1.5 ml-4 min-w-0">
                      {item.href ? (
                        <Link href={item.href} className="text-blue-600 hover:text-blue-800 font-medium truncate">{item.value}</Link>
                      ) : (
                        <span className="text-zinc-700 truncate">{item.value}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Contact Details — SF style */}
            <div className="space-y-3 pt-5 border-t border-zinc-100">
              <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Contact Details</h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs py-1 px-2 rounded hover:bg-zinc-50">
                  <span className="text-zinc-400 flex-shrink-0">Name</span>
                  <InlineEdit value={ticket.contact_name || ''} onSave={v => updateField('contact_name', v)} emptyText="Add name" displayClassName="text-xs text-zinc-700 font-medium" />
                </div>
                <div className="flex justify-between items-center text-xs py-1 px-2 rounded hover:bg-zinc-50">
                  <span className="text-zinc-400 flex-shrink-0">Email</span>
                  <InlineEdit value={ticket.contact_email || ''} onSave={v => updateField('contact_email', v)} emptyText="Add email" displayClassName="text-xs text-zinc-700" />
                </div>
                <div className="flex justify-between items-center text-xs py-1 px-2 rounded hover:bg-zinc-50">
                  <span className="text-zinc-400 flex-shrink-0">Phone</span>
                  <InlineEdit value={ticket.contact_phone || ''} onSave={v => updateField('contact_phone', v)} emptyText="Add phone" displayClassName="text-xs text-zinc-700" />
                </div>
              </div>
            </div>

            {/* SLA */}
            {(ticket.sla_response_due || ticket.sla_resolution_due) && (
              <div className="space-y-4 pt-5 border-t border-zinc-100">
                <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">SLA</h3>
                {ticket.sla_response_due && (() => {
                  const due = new Date(ticket.sla_response_due)
                  const now = new Date()
                  const responded = !!ticket.first_response_at
                  const breached = !responded && now > due
                  const met = ticket.sla_response_met
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Response</span>
                        {responded ? (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${met ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{met ? 'Met' : 'Breached'}</span>
                        ) : breached ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Overdue</span>
                        ) : (
                          <span className="text-[10px] text-zinc-400">{due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        )}
                      </div>
                      {!responded && !breached && (
                        <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.max(5, Math.min(95, ((now.getTime() - new Date(ticket.created_date).getTime()) / (due.getTime() - new Date(ticket.created_date).getTime())) * 100))}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })()}
                {ticket.sla_resolution_due && (() => {
                  const due = new Date(ticket.sla_resolution_due)
                  const now = new Date()
                  const resolved = ticket.status === 'closed'
                  const breached = !resolved && now > due
                  return (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-zinc-500">Resolution</span>
                        {resolved ? (
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ticket.sla_resolution_met ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>{ticket.sla_resolution_met ? 'Met' : 'Breached'}</span>
                        ) : breached ? (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-50 text-red-600">Overdue</span>
                        ) : (
                          <span className="text-[10px] text-zinc-400">{due.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                        )}
                      </div>
                      {!resolved && !breached && (
                        <div className="h-1 bg-zinc-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.max(5, Math.min(95, ((now.getTime() - new Date(ticket.created_date).getTime()) / (due.getTime() - new Date(ticket.created_date).getTime())) * 100))}%` }} />
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )}

            {/* Related Tickets */}
            {relatedTickets.length > 0 && (
              <div className="space-y-2 pt-5 border-t border-zinc-100">
                <h3 className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">Related Cases</h3>
                {relatedTickets.map((rt: any) => (
                  <Link key={rt.id} href={`/tickets/${rt.id}`} className="flex items-center justify-between text-xs py-1.5 hover:bg-zinc-50 rounded px-1 -mx-1 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                        rt.priority === 'critical' ? 'bg-red-500' : rt.priority === 'high' ? 'bg-orange-500' : rt.priority === 'medium' ? 'bg-amber-400' : 'bg-zinc-300'
                      }`}></span>
                      <span className="text-zinc-500 font-mono">T-{String(rt.ticket_number).padStart(5, '0')}</span>
                      <span className="text-zinc-700 truncate">{rt.title}</span>
                    </div>
                    <span className={`text-[10px] font-medium flex-shrink-0 ml-2 ${rt.status === 'closed' ? 'text-zinc-400' : 'text-zinc-600'}`}>{rt.status}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>}

          {/* ── RIGHT: Tabbed Content Card ── */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden shadow-sm">
              {/* Tab bar */}
              <div className="flex items-center border-b border-zinc-100 px-2 overflow-x-auto">
                {([
                  { key: 'timeline', label: 'Feed', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
                  { key: 'details', label: 'Details', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16' },
                  { key: 'emails', label: isVoicemailTicket ? 'Voicemail' : 'Emails', icon: isVoicemailTicket ? 'M12 18.75a6 6 0 006-6V10.5a6 6 0 10-12 0v2.25a6 6 0 006 6zm0 0v2.25m-4.5 0h9' : 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                  { key: 'attachments', label: 'Files', icon: 'M3 16.5V7.5A2.5 2.5 0 015.5 5h13A2.5 2.5 0 0121 7.5v9A2.5 2.5 0 0118.5 19h-13A2.5 2.5 0 013 16.5zM8 11l2.25 2.25L13 10l4 5H7l1-4z' },
                  { key: 'notes', label: 'Notes', icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
                ] as const).map(tab => (
                  <button key={tab.key} data-ai-target={`ticket-tab-${tab.key}`} onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-3 text-[12px] font-medium border-b-2 transition-colors ${
                      activeTab === tab.key
                        ? 'border-zinc-900 text-zinc-900'
                        : 'border-transparent text-zinc-400 hover:text-zinc-600'
                    }`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={tab.icon} />
                    </svg>
                    {tab.label}
                    {tab.key === 'emails' && communicationCount > 0 && <span className="text-[10px] text-zinc-300">{communicationCount}</span>}
                    {tab.key === 'attachments' && displayAttachments.length > 0 && <span className="text-[10px] text-zinc-300">{displayAttachments.length}</span>}
                    {tab.key === 'notes' && filterCounts.comments > 0 && <span className="text-[10px] text-zinc-300">{filterCounts.comments}</span>}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div className="min-h-[300px]">

                {/* ── Timeline Tab ── */}
                {activeTab === 'timeline' && (
                  <div>
                    {/* Resolution workspace remains available before closure so AI can safely draft notes for human review. */}
                      <div
                        data-ai-target="ticket-resolution-area"
                        className={`px-6 py-4 border-b ${ticket.status === 'closed' ? 'bg-emerald-50/50 border-emerald-100' : 'bg-blue-50/40 border-blue-100'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 ${ticket.status === 'closed' ? 'text-emerald-500' : 'text-blue-500'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            <span className={`text-sm font-medium ${ticket.status === 'closed' ? 'text-emerald-900' : 'text-blue-900'}`}>
                              {ticket.status === 'closed' ? 'Resolved' : 'Resolution'}
                            </span>
                          </div>
                          {!editResolution && <button data-ai-target="ticket-resolution-edit" onClick={() => setEditResolution(true)} className={`text-xs font-medium ${ticket.status === 'closed' ? 'text-emerald-600 hover:text-emerald-800' : 'text-blue-600 hover:text-blue-800'}`}>{resolutionNotes ? 'Edit' : 'Add notes'}</button>}
                        </div>
                        {editResolution ? (
                          <div className="mt-3 space-y-2">
                            <textarea data-ai-target="ticket-resolution-notes" aria-label="Ticket resolution notes" value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)}
                              className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 bg-white ${ticket.status === 'closed' ? 'border-emerald-200 focus:ring-emerald-500/20' : 'border-blue-200 focus:ring-blue-500/20'}`} rows={2} />
                            <div className="flex gap-2">
                              <button data-ai-target="ticket-resolution-save" onClick={saveResolution} className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-emerald-700">Save</button>
                              <button onClick={() => setEditResolution(false)} className="text-xs text-zinc-500 px-3 py-1.5">Cancel</button>
                            </div>
                          </div>
                        ) : resolutionNotes ? (
                          <p className={`text-sm mt-1 ${ticket.status === 'closed' ? 'text-emerald-800/70' : 'text-blue-800/70'}`}>{resolutionNotes}</p>
                        ) : (
                          <p className="text-xs text-zinc-400 mt-1">Add resolution notes before closing the ticket.</p>
                        )}
                      </div>

                    {allTimelineItems.length === 0 ? (
                      <div className="py-20 text-center">
                        <div className="w-10 h-10 rounded-full bg-zinc-50 flex items-center justify-center mx-auto mb-3">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-zinc-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        </div>
                        <p className="text-sm text-zinc-400">No activity yet</p>
                      </div>
                    ) : (
                      <div className="px-6 py-4">
                        <div className="relative space-y-0">
                          <div className="absolute left-[15px] top-2 bottom-2 w-px bg-zinc-100" />
                          {allTimelineItems.map((item, idx) => {
                            const timeStr = item.time.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                            if (item.type === 'change') {
                              const log = item.data as Activity
                              const details = typeof log.details === 'string' ? JSON.parse(log.details) : log.details
                              const desc = log.action === 'ticket_created' ? `Ticket created`
                                : log.action === 'ticket_status_change' ? `Status: ${details.old_status?.replace('_', ' ')} \u2192 ${details.new_status?.replace('_', ' ')}`
                                : log.action === 'ticket_assigned' ? `Assigned to ${details.assigned_to}`
                                : log.action === 'ticket_category_change' ? `Category \u2192 ${details.new_category}`
                                : log.action === 'ticket_priority_change' ? `Priority \u2192 ${details.new_priority}`
                                : 'Updated'
                              return (
                                <div key={`a-${idx}`} className="relative flex items-center gap-3 py-2">
                                  <div className="relative z-10 flex-shrink-0 w-[30px] flex justify-center">
                                    <div className="w-2 h-2 rounded-full bg-zinc-300" />
                                  </div>
                                  <span className="text-xs text-zinc-400 flex-1">{desc}</span>
                                  <span className="text-[10px] text-zinc-300 flex-shrink-0 tabular-nums">{timeStr}</span>
                                </div>
                              )
                            }
                            const comment = item.data as Comment
                            const isEmail = item.type === 'email'
                            return (
                              <div key={`c-${comment.id}`} className="relative flex gap-3 py-3">
                                <div className="relative z-10 flex-shrink-0 w-[30px] flex justify-center pt-1">
                                  <div className={`w-[30px] h-[30px] rounded-full flex items-center justify-center text-[10px] font-semibold ${
                                    isEmail ? 'bg-blue-50 text-[#0A52EF] border border-blue-100' : comment.is_internal ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-600'
                                  }`}>{getInitials(comment.author_name)}</div>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-semibold text-zinc-900">{comment.author_name}</span>
                                    {comment.is_internal && <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase tracking-wider">Internal</span>}
                                    {isEmail && <span className="text-[9px] font-semibold bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded uppercase tracking-wider">{isVoicemailTicket ? 'Voicemail' : 'Email'}</span>}
                                    {isPortalComment(comment) && <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase tracking-wider">Portal comment</span>}
                                    <span className="text-[10px] text-zinc-300 tabular-nums">{timeStr}</span>
                                    {!isEmail && canDeleteComment(comment) && (
                                      <button type="button" onClick={() => deleteComment(comment.id)} title="Delete note"
                                        className="ml-auto text-zinc-300 hover:text-red-600 transition-colors">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                      </button>
                                    )}
                                  </div>
                                  <div className={`rounded-lg p-4 shadow-sm ${
                                    isEmail ? 'bg-white border border-zinc-200' : comment.is_internal ? 'bg-indigo-50/40 border border-indigo-100' : 'bg-zinc-50/50 border border-zinc-100'
                                  }`}>
                                    {isEmail ? (
                                      <div className="max-w-prose"><TicketContent content={comment.body} variant="email" /></div>
                                    ) : (
                                      comment.body?.trim() ? <div className="max-w-prose"><CommentContent content={comment.body} /></div> : null
                                    )}
                                    {(() => {
                                      // Files posted with this note (Chris D 7/29). Images preview
                                      // inline; anything else gets a plain download link.
                                      const noteFiles = attachments.filter((a: any) => a.comment_id === comment.id)
                                      if (noteFiles.length === 0) return null
                                      return (
                                        <div className={`flex flex-wrap gap-2 ${comment.body?.trim() ? 'mt-3' : ''}`}>
                                          {noteFiles.map((a: any) => (
                                            a.mime_type?.startsWith('image/') ? (
                                              <a key={a.id} href={a.image_url} target="_blank" rel="noreferrer" className="block">
                                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                                <img
                                                  src={a.image_url}
                                                  alt={a.filename || 'Attachment'}
                                                  className="max-h-44 rounded-md border border-zinc-200 object-cover hover:opacity-90 transition-opacity"
                                                />
                                              </a>
                                            ) : (
                                              <a
                                                key={a.id}
                                                href={a.image_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#0A52EF] border border-zinc-200 bg-white rounded-md px-2.5 py-1.5 hover:bg-zinc-50 transition-colors"
                                              >
                                                {a.filename || 'Attachment'}
                                              </a>
                                            )
                                          ))}
                                        </div>
                                      )
                                    })()}
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Comment composer */}
                    <div className="px-6 py-4 bg-zinc-50/50 border-t border-zinc-100">
                      {commentToast && (
                        <div className={`mb-3 rounded-md px-3 py-2 text-xs flex items-start justify-between gap-3 border ${
                          commentToast.kind === 'emailed' || commentToast.kind === 'closed' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
                          commentToast.kind === 'internal' ? 'bg-indigo-50 border-indigo-200 text-indigo-800' :
                          commentToast.kind === 'no_list' || commentToast.kind === 'in_progress' ? 'bg-amber-50 border-amber-200 text-amber-900' :
                          'bg-rose-50 border-rose-200 text-rose-800'
                        }`}>
                          <span className="font-medium">
                            {commentToast.kind === 'emailed' && `Posted — emailed to ${commentToast.count} client recipient${commentToast.count === 1 ? '' : 's'} on the venue's distribution list.`}
                            {commentToast.kind === 'closed' && `Posted and closed — one notification sent.`}
                            {commentToast.kind === 'in_progress' && `Posted and moved to In Progress — one notification sent.`}
                            {commentToast.kind === 'internal' && `Posted as internal note — not emailed to the client.`}
                            {commentToast.kind === 'no_list' && `Posted, but no email went out — this venue has no client distribution list configured. Add recipients in venue settings to email future Client comments.`}
                            {commentToast.kind === 'send_failed' && `Posted, but the client email failed to send. Check Slack #ops or the logs.`}
                          </span>
                          <button type="button" onClick={() => setCommentToast(null)} className="text-current/60 hover:text-current">×</button>
                        </div>
                      )}
                      <form onSubmit={addComment}>
                        {showCanned && cannedResponses.length > 0 && (
                          <div className="mb-3 border border-zinc-200 rounded-lg bg-white divide-y divide-zinc-100 max-h-40 overflow-y-auto">
                            {cannedResponses.map(cr => (
                              <button key={cr.id} type="button"
                                onClick={() => { setNewComment(cr.body); setIsInternal(false); setShowCanned(false) }}
                                className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 transition-colors">
                                <p className="text-xs font-medium text-zinc-900">{cr.title}</p>
                                <p className="text-xs text-zinc-400 truncate mt-0.5">{cr.body}</p>
                              </button>
                            ))}
                          </div>
                        )}
                        <div className="relative">
                          <textarea
                            data-ai-target="ticket-comment"
                            aria-label="Ticket comment or internal note"
                            ref={commentTextareaRef}
                            value={newComment}
                            onChange={onCommentChange}
                            onKeyDown={onCommentKeyDown}
                            onPaste={onCommentPaste}
                            placeholder={isInternal ? 'Write an internal note... (type @ to tag a teammate, paste a screenshot to attach)' : 'Write a client-visible comment... (type @ to tag a teammate, paste a screenshot to attach)'}
                            className={`w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${isInternal ? 'border-indigo-200 bg-indigo-50/20 focus:ring-indigo-400/20 placeholder:text-indigo-300' : 'border-zinc-200 bg-white focus:ring-blue-500/20 placeholder:text-zinc-300'}`}
                            rows={2}
                          />
                          {mentionQuery !== null && filteredMentionStaff.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-56 overflow-y-auto bg-white border border-zinc-200 rounded-md shadow-lg">
                              <div className="px-3 py-1.5 text-[10px] font-medium text-zinc-400 uppercase tracking-wide border-b border-zinc-100">Tag teammate</div>
                              {filteredMentionStaff.map((s, i) => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onMouseDown={(e) => { e.preventDefault(); insertMention(s) }}
                                  onMouseEnter={() => setMentionHighlight(i)}
                                  className={`w-full text-left px-3 py-1.5 text-xs ${i === mentionHighlight ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 hover:bg-zinc-50'}`}
                                >
                                  <span className="font-medium">@{s.full_name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center justify-between gap-3 mt-2">
                          <div className="inline-flex bg-zinc-100/80 rounded-md p-0.5">
                            <button type="button" onClick={() => setShowCanned(!showCanned)}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${showCanned ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Quick Replies
                            </button>
                            <button type="button" data-ai-target="ticket-comment-client" onClick={() => { setIsInternal(false); setVisibilityTouched(true) }}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${!isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Client
                              {ticket && typeof (ticket as any).venue_distribution_count === 'number' && (
                                <span className={`ml-1 ${(ticket as any).venue_distribution_count > 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                                  · {(ticket as any).venue_distribution_count > 0 ? `${(ticket as any).venue_distribution_count} ✉` : 'no list'}
                                </span>
                              )}
                            </button>
                            <button type="button" data-ai-target="ticket-comment-internal" onClick={() => { setIsInternal(true); setVisibilityTouched(true) }}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Internal
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            {(ticket.status === 'new' || ticket.status === 'on_hold') && (
                              <button type="button" data-ai-target="ticket-comment-post-inprogress"
                                onClick={(e) => addComment(e as unknown as FormEvent, 'in_progress')}
                                disabled={submitting || !newComment.trim()}
                                title="Post this note and move the ticket to In Progress — sends one notification"
                                className="border border-amber-200 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-amber-100 disabled:opacity-30 transition-all">
                                {submitting ? 'Posting...' : 'Post & In Progress'}
                              </button>
                            )}
                            {ticket.status !== 'closed' && (
                              <button type="button" data-ai-target="ticket-comment-post-close"
                                onClick={(e) => addComment(e as unknown as FormEvent, 'close')}
                                disabled={submitting || !newComment.trim()}
                                title="Post this note and close the ticket — sends one notification"
                                className="border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-emerald-100 disabled:opacity-30 transition-all">
                                {submitting ? 'Posting...' : 'Post & Close'}
                              </button>
                            )}
                            <button type="submit" data-ai-target="ticket-comment-submit" disabled={submitting || (!newComment.trim() && pendingFiles.length === 0)}
                              className="bg-zinc-900 text-white px-4 py-1.5 rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-30 transition-all">
                              {submitting ? 'Posting...' : 'Post'}
                            </button>
                          </div>
                        </div>

                        {/* Screenshots and files ride along with the note (Chris D 7/29) */}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 text-[10px] font-medium text-zinc-500 border border-zinc-200 rounded-md px-2.5 py-1 cursor-pointer hover:bg-zinc-50 transition-colors">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                            </svg>
                            Attach
                            <input
                              type="file"
                              multiple
                              className="hidden"
                              onChange={(e) => { stageFiles(e.target.files); e.target.value = '' }}
                            />
                          </label>
                          <span className="text-[10px] text-zinc-400">or paste a screenshot</span>
                          {pendingFiles.map((f, i) => (
                            <span key={i} className="inline-flex items-center gap-1.5 text-[10px] bg-zinc-100 text-zinc-700 rounded-md px-2 py-1">
                              {f.name || 'screenshot'}
                              <button
                                type="button"
                                onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                                className="text-zinc-400 hover:text-zinc-700"
                                aria-label="Remove attachment"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                          {commentFileError && (
                            <span className="text-[10px] text-red-600">{commentFileError}</span>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* ── Details Tab (SF-style two-column field grid) ── */}
                {activeTab === 'details' && (
                  <div className="p-6">
                    {/* Case Information */}
                    <div className="mb-6">
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-zinc-200"></span>Case Information
                      </h3>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Case Number</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{caseNum}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Case Owner</span>
                          <InlineEdit
                            value={ticket.assigned_to || ''}
                            type="select"
                            options={[{ value: '', label: 'Unassigned' }, ...staffList.map(s => ({ value: s.id, label: s.full_name }))]}
                            onSave={v => updateField('assigned_to', v || null)}
                            displayClassName="text-sm text-zinc-800 font-medium"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Case Type</span>
                          <InlineEdit
                            value={ticket.ticket_type || 'support'}
                            type="select"
                            options={[{ value: 'support', label: 'Support' }, { value: 'dev_ticket', label: 'Dev Ticket' }]}
                            onSave={v => updateField('ticket_type', v)}
                            displayClassName="text-sm text-zinc-800 font-medium"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Case Origin</span>
                          <InlineEdit
                            value={ticket.source || 'web'}
                            type="select"
                            options={[{ value: 'web', label: 'Web' }, { value: 'email', label: 'Email' }, { value: 'voicemail', label: 'Voicemail' }, { value: 'phone', label: 'Phone' }, { value: 'slack', label: 'Slack' }, { value: 'portal', label: 'Portal' }]}
                            onSave={v => updateField('source', v)}
                            displayClassName="text-sm text-zinc-800 font-medium"
                          />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Account Name</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.venue_name}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Category</span>
                          <InlineEdit
                            value={ticket.category || 'general'}
                            type="select"
                            options={Object.entries(categoryLabels).map(([value, label]) => ({ value, label }))}
                            onSave={v => updateField('category', v)}
                            displayClassName="text-sm text-zinc-800 font-medium"
                          />
                        </div>
                        {ticket.subcategory && (
                          <div className="flex flex-col">
                            <span className="text-[11px] text-zinc-400">Specific Issue</span>
                            <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.subcategory}</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Contact Name</span>
                          <InlineEdit value={ticket.contact_name || ''} onSave={v => updateField('contact_name', v)} placeholder="Add contact name" emptyText="Not set" displayClassName="text-sm text-zinc-800 font-medium" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Contact Email</span>
                          <InlineEdit value={ticket.contact_email || ''} onSave={v => updateField('contact_email', v)} placeholder="email@example.com" emptyText="Not set" displayClassName="text-sm text-zinc-800 font-medium" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Contact Phone</span>
                          <InlineEdit value={ticket.contact_phone || ''} onSave={v => updateField('contact_phone', v)} placeholder="(555) 123-4567" emptyText="Not set" displayClassName="text-sm text-zinc-800 font-medium" />
                        </div>
                        {ticket.sf_case_number && (
                          <div className="flex flex-col">
                            <span className="text-[11px] text-zinc-400">SF Case #</span>
                            <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.sf_case_number}</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Created</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.created_date}</span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Last Modified</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.updated_date}</span>
                        </div>
                        {ticket.resolved_date && (
                          <div className="flex flex-col">
                            <span className="text-[11px] text-zinc-400">Closed</span>
                            <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.resolved_date}</span>
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="text-[11px] text-zinc-400">Created By</span>
                          <span className="text-sm text-zinc-800 font-medium mt-0.5">{ticket.created_by_name}</span>
                        </div>
                      </div>
                    </div>

                    {/* Subject + Description */}
                    <div className="mb-6">
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-zinc-200"></span>Description Information
                      </h3>
                      <div className="space-y-3">
                        <div>
                          <span className="text-[11px] text-zinc-400 block">Subject</span>
                          <InlineEdit value={ticket.title} onSave={v => updateField('title', v)} displayClassName="text-sm text-zinc-800 font-medium" />
                        </div>
                        <div>
                          <span className="text-[11px] text-zinc-400 block mb-1">Description</span>
                          <InlineEdit
                            value={ticket.description || ''}
                            type="textarea"
                            onSave={v => updateField('description', v)}
                            placeholder="Add description..."
                            emptyText="No description"
                            displayClassName="text-sm text-zinc-700"
                          />
                        </div>
                        {ticket.resolution_notes && (
                          <div>
                            <span className="text-[11px] text-zinc-400 block mb-1">Resolution Notes</span>
                            <div className="text-sm text-zinc-700 bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                              {ticket.resolution_notes}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Additional Information */}
                    <div>
                      <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-zinc-200"></span>Additional Information
                      </h3>
                      <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        {[
                          ['Status', ticket.status.replace('_', ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())],
                          ['Priority', ticket.priority.replace(/\b\w/g, (c: string) => c.toUpperCase())],
                          ['Date/Time Opened', ticket.created_date],
                          ['Date/Time Closed', ticket.resolved_date || '—'],
                          ['Last Modified', ticket.updated_date],
                          ['Created By', ticket.created_by_name],
                        ].map(([label, value], i) => (
                          <div key={i} className="flex flex-col">
                            <span className="text-[11px] text-zinc-400">{label}</span>
                            <span className="text-sm text-zinc-800 font-medium mt-0.5">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Communication Tab ── */}
                {activeTab === 'emails' && (
                  <div>
                    <div className="p-6 space-y-5 bg-zinc-50/40">
                      {!isVoicemailTicket && (
                        <form onSubmit={sendEmailReply} className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 bg-white px-4 py-3">
                            <div className="flex min-w-0 items-center gap-2 text-xs">
                              <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-blue-50 text-[#0A52EF]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="font-semibold text-zinc-900">Reply</span>
                                  <span className="text-zinc-300">from</span>
                                  <span className="font-medium text-zinc-700">support@anc.com</span>
                                  <span className="text-zinc-300">to</span>
                                  <span className={`truncate font-semibold ${!replyTarget || noClientRecipient ? 'text-amber-700' : 'text-zinc-900'}`}>
                                    {replyTarget ? replyTarget.email : 'No contact email'}
                                  </span>
                                  {noClientRecipient && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                      ANC {internalRecipients.length > 1 ? 'addresses' : 'address'} — not the client
                                    </span>
                                  )}
                                  {mixedRecipients && (
                                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                                      includes {internalRecipients.length} ANC {internalRecipients.length > 1 ? 'addresses' : 'address'}
                                    </span>
                                  )}
                                </div>
                                <p className="mt-0.5 truncate text-[11px] text-zinc-400">Case {caseNum} · {ticket.venue_name || 'ANC Support'}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Microsoft</span>
                              <span
                                className={`h-2 w-2 rounded-full ${recipientReady ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                title={recipientReady ? 'Ready to send' : replyTarget ? 'Goes to ANC, not the client' : 'Recipient needed'}
                              ></span>
                            </div>
                          </div>
                          <div className="space-y-3 p-4">

                            {(noClientRecipient || mixedRecipients) && (
                              <div data-ai-target="ticket-email-internal-warning" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                                {noClientRecipient ? (
                                  <>
                                    <span className="font-semibold">This goes to ANC, not the client.</span>{' '}
                                    {internalRecipients.join(', ')} {internalRecipients.length > 1 ? 'are' : 'is'} on our own domain, and {internalRecipients.length > 1 ? 'they are' : 'it is'} the only {internalRecipients.length > 1 ? 'addresses' : 'address'} on file for this ticket. Add the customer&rsquo;s contact to {ticket.venue_name || 'the venue'} and it will route to them here and on every future ticket.
                                  </>
                                ) : (
                                  <>
                                    <span className="font-semibold">Some of these are ANC addresses.</span>{' '}
                                    {internalRecipients.join(', ')} {internalRecipients.length > 1 ? 'are' : 'is'} on our own domain — a client-facing reply here reaches {externalRecipients.length > 1 ? 'the customers' : 'the customer'} and us together.
                                  </>
                                )}
                              </div>
                            )}

                            <div data-ai-target="ticket-email-recipients" className="rounded-lg border border-zinc-200 bg-white">
                              <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
                                <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">Who this reaches</span>
                                <span className="text-[11px] text-zinc-400">
                                  {externalRecipients.length} client · {internalRecipients.length} ANC
                                </span>
                              </div>
                              {replyTargetDetails.length > 0 ? (
                                <ul className="divide-y divide-zinc-50">
                                  {replyTargetDetails.map(recipient => {
                                    const internal = isInternalEmail(recipient.email)
                                    // Only a venue-list entry is ours to take off. Someone who
                                    // wrote in is on this ticket because they wrote in.
                                    const onVenueList = allDistributionEmails.some(
                                      existing => existing.toLowerCase() === recipient.email.toLowerCase()
                                    )
                                    const removing = removingClientEmail?.toLowerCase() === recipient.email.toLowerCase()
                                    return (
                                      <li key={recipient.email} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2">
                                        <span className="min-w-0 truncate text-sm text-zinc-800">{recipient.email}</span>
                                        <span className="flex flex-shrink-0 items-center gap-2">
                                          <span className="text-[11px] text-zinc-400">{recipient.source}</span>
                                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${internal ? 'bg-amber-100 text-amber-800' : 'bg-emerald-50 text-emerald-700'}`}>
                                            {internal ? 'ANC' : 'Client'}
                                          </span>
                                          {onVenueList && ticket.venue_id && (
                                            <button
                                              type="button"
                                              data-ai-target="ticket-remove-client-email"
                                              onClick={() => removeClientEmail(recipient.email)}
                                              disabled={removing}
                                              aria-label={`Remove ${recipient.email} from ${ticket.venue_name || 'this venue'}`}
                                              title={`Remove from ${ticket.venue_name || 'this venue'}`}
                                              className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                                            >
                                              {removing ? 'Removing' : 'Remove'}
                                            </button>
                                          )}
                                        </span>
                                      </li>
                                    )
                                  })}
                                </ul>
                              ) : (
                                <p className="px-3 py-3 text-xs text-zinc-400">No client email on file for this ticket yet.</p>
                              )}
                              {ticket.venue_id && (
                                <form onSubmit={addClientEmail} className="flex flex-wrap items-center gap-2 border-t border-zinc-100 bg-zinc-50/70 px-3 py-2.5">
                                  <input
                                    type="email"
                                    data-ai-target="ticket-add-client-email"
                                    aria-label="Add a client email to this venue"
                                    value={newClientEmail}
                                    onChange={e => { setNewClientEmail(e.target.value); setClientEmailError(null) }}
                                    placeholder="client@venue.com"
                                    className="min-w-0 flex-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-xs text-zinc-900 outline-none placeholder:text-zinc-400 focus:border-[#0A52EF]"
                                  />
                                  {knownEmails.length > 0 && (
                                    <button
                                      type="button"
                                      data-ai-target="ticket-known-emails-toggle"
                                      onClick={() => setShowKnownEmails(open => !open)}
                                      aria-expanded={showKnownEmails}
                                      className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100"
                                    >
                                      Previous {knownEmails.length} <span aria-hidden="true">{showKnownEmails ? '▴' : '▾'}</span>
                                    </button>
                                  )}
                                  <button
                                    type="submit"
                                    data-ai-target="ticket-add-client-email-save"
                                    disabled={addingClientEmail || !newClientEmail.trim()}
                                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    {addingClientEmail ? 'Adding' : 'Add'}
                                  </button>
                                  <p className={`w-full text-[11px] ${clientEmailError ? 'text-rose-600' : 'text-zinc-400'}`}>
                                    {clientEmailError || `Saved to ${ticket.venue_name || 'this venue'} — used on this ticket and every future one.`}
                                  </p>

                                  {/* The venue's own correspondence history — pick instead of retype. */}
                                  {showKnownEmails && knownEmails.length > 0 && (
                                    <ul
                                      data-ai-target="ticket-known-emails-list"
                                      className="max-h-56 w-full overflow-y-auto rounded-md border border-zinc-200 bg-white"
                                    >
                                      {knownEmails.map(known => (
                                        <li key={known.email} className="border-b border-zinc-50 last:border-b-0">
                                          <button
                                            type="button"
                                            onClick={() => pickKnownEmail(known.email)}
                                            disabled={addingClientEmail}
                                            className="flex w-full flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2 text-left transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                                          >
                                            <span className="min-w-0 truncate text-xs text-zinc-800">{known.email}</span>
                                            <span className="flex flex-shrink-0 items-center gap-2 text-[11px] text-zinc-400">
                                              <span>
                                                {known.lastSource}
                                                {known.timesUsed > 1 ? ` · ${known.timesUsed}×` : ''}
                                                {known.lastUsedAt ? ` · ${new Date(known.lastUsedAt).toLocaleDateString()}` : ''}
                                              </span>
                                              {known.internal && (
                                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">ANC</span>
                                              )}
                                            </span>
                                          </button>
                                        </li>
                                      ))}
                                    </ul>
                                  )}
                                </form>
                              )}
                            </div>

                            <div className="rounded-lg border border-zinc-200 bg-white">
                              <div className="flex items-center gap-2 border-b border-zinc-100 px-3 py-2 text-xs">
                                <span className="font-semibold text-zinc-400">Subject</span>
                                <span className="min-w-0 truncate font-medium text-zinc-800">Re: Case {String(ticket.ticket_number).padStart(8, '0')} - {ticket.title}</span>
                              </div>
                              <textarea
                                data-ai-target="ticket-email-reply"
                                aria-label="Ticket client email reply"
                                ref={emailReplyRef}
                                value={emailReply}
                                onChange={(e) => setEmailReply(e.target.value)}
                                placeholder="Write a clear client-facing reply..."
                                rows={8}
                                className="min-h-[230px] w-full resize-none border-0 bg-transparent px-3 py-3 text-sm leading-6 text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-0"
                              />
                              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/80 px-3 py-2.5">
                                <div className={`text-[11px] ${noClientRecipient ? 'text-amber-700' : 'text-zinc-500'}`}>
                                  {replyTarget
                                    ? noClientRecipient
                                      ? `Route: ${replyTarget.source} — ANC only`
                                      : `Route: ${replyTarget.source}`
                                    : 'Add a contact email before sending.'}
                                </div>
                                <button
                                  type="submit"
                                  data-ai-target="ticket-email-send"
                                  disabled={sendingEmail || !emailReply.trim() || !replyTarget}
                                  className="inline-flex items-center gap-2 rounded-md bg-[#0A52EF] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#0840C0] disabled:cursor-not-allowed disabled:opacity-35"
                                >
                                  {sendingEmail && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white"></span>}
                                  {sendingEmail ? 'Sending' : 'Send Reply'}
                                </button>
                              </div>
                            </div>

                            {emailStatus && (
                              <div className={`rounded-xl border px-4 py-3 text-xs font-medium ${emailStatus.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
                                {emailStatus.message}
                              </div>
                            )}
                          </div>
                        </form>
                      )}

                      {communicationCount === 0 ? (
                        <p className="text-sm text-zinc-400 py-10 text-center">{isVoicemailTicket ? 'No voicemail transcript on this ticket' : 'No emails on this ticket'}</p>
                      ) : (
                        <>
                        {isVoicemailTicket && (ticket.contact_phone || voicemailRecordingUrl) && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {ticket.contact_phone && (
                              <div className="border border-zinc-200 rounded-xl bg-white p-4 shadow-sm">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Caller</span>
                                <p className="text-sm font-medium text-zinc-900 mt-1">{ticket.contact_phone}</p>
                              </div>
                            )}
                            {voicemailRecordingUrl && (
                              <a href={voicemailRecordingUrl} target="_blank" rel="noreferrer" className="border border-blue-100 rounded-xl bg-white p-4 hover:bg-blue-50 transition-colors shadow-sm">
                                <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-400">Recording</span>
                                <p className="text-sm font-medium text-blue-700 mt-1">Open voicemail audio</p>
                              </a>
                            )}
                          </div>
                        )}
                        {/* Original message from ticket creation */}
                        {ticket.original_message && (
                          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
                            <div className="flex items-center gap-3 border-b border-zinc-100 bg-zinc-50/80 px-5 py-3">
                              <div className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-[10px] font-semibold text-[#0A52EF]">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={isVoicemailTicket ? 'M12 18.75a6 6 0 006-6V10.5a6 6 0 10-12 0v2.25a6 6 0 006 6zm0 0v2.25m-4.5 0h9' : 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z'} /></svg>
                              </div>
                              <div className="min-w-0">
                                <span className="text-xs font-semibold text-zinc-900">{isVoicemailTicket ? 'Voicemail Transcript' : 'Original Email'}</span>
                                <p className="mt-0.5 truncate text-[11px] text-zinc-400">{ticket.contact_email || ticket.contact_name || ticket.created_by_name}</p>
                              </div>
                              <span className="ml-auto whitespace-nowrap text-[10px] tabular-nums text-zinc-300">{ticket.created_date}</span>
                            </div>
                            <div className="max-w-none overflow-hidden px-5 py-4"><TicketContent content={ticket.original_message} variant="email" /></div>
                          </div>
                        )}
                        {/* Email comments from timeline */}
                        {emailTimelineItems.map((item, idx) => {
                          const comment = item.data as Comment
                          const timeStr = item.time.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                          return (
                            <div key={idx} className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.06)]">
                              <div className="flex items-center gap-3 border-b border-zinc-100 bg-white px-5 py-3">
                                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-[10px] font-semibold text-[#0A52EF]">{getInitials(comment.author_name)}</div>
                                <div className="min-w-0">
                                  <span className="text-xs font-semibold text-zinc-900">{comment.author_name}</span>
                                  <p className="mt-0.5 text-[11px] text-zinc-400">{isTicketEmailComment(comment) ? 'Email message' : 'Message'}</p>
                                </div>
                                <span className="ml-auto whitespace-nowrap text-[10px] tabular-nums text-zinc-300">{timeStr}</span>
                              </div>
                              <div className="max-w-none overflow-hidden px-5 py-4"><TicketContent content={comment.body} variant="email" /></div>
                            </div>
                          )
                        })}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Attachments Tab ── */}
                {activeTab === 'attachments' && (
                  <div className="p-6 space-y-5">
                    <div className="border border-zinc-200 rounded-lg bg-zinc-50/50 p-4">
                      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                        <div>
                          <h3 className="text-sm font-semibold text-zinc-900">Add Attachment</h3>
                          <p className="text-xs text-zinc-500 mt-0.5">Photos, video, PDFs, or office docs. Up to 22 MB.</p>
                        </div>
                        {attachmentStatus && (
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${attachmentStatus.type === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}`}>
                            {attachmentStatus.message}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
                        <input
                          value={attachmentCaption}
                          onChange={(e) => setAttachmentCaption(e.target.value)}
                          placeholder="Optional caption, e.g. right ribbon board error"
                          className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
                        />
                        <label className={`cursor-pointer text-center border border-zinc-200 bg-white rounded-lg px-3 py-2.5 text-sm font-semibold text-zinc-700 hover:border-zinc-400 ${uploadingAttachment ? 'opacity-50 pointer-events-none' : ''}`}>
                          {uploadingAttachment ? 'Uploading...' : 'Choose File'}
                          <input
                            type="file"
                            accept={ATTACHMENT_ACCEPT}
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null
                              uploadAttachment(file)
                              e.currentTarget.value = ''
                            }}
                          />
                        </label>
                      </div>
                      <div className="mt-3 inline-flex bg-zinc-100/80 rounded-md p-0.5">
                        <button type="button" onClick={() => setAttachmentInternal(false)}
                          className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${!attachmentInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                          Client Visible
                        </button>
                        <button type="button" onClick={() => setAttachmentInternal(true)}
                          className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${attachmentInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                          Internal
                        </button>
                      </div>
                    </div>

                    {displayAttachments.length === 0 ? (
                      <p className="text-sm text-zinc-400 py-10 text-center">No attachments yet</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {displayAttachments.map((attachment) => {
                          const mime = attachment.mime_type || ''
                          const isImage = mime.startsWith('image/')
                          const isVideo = mime.startsWith('video/')
                          const isAudio = mime.startsWith('audio/')
                          const isPdf = mime === 'application/pdf'
                          const kindLabel = isImage ? 'Image' : isVideo ? 'Video' : isAudio ? 'Audio' : isPdf ? 'PDF' : (mime.split('/').pop() || 'File').toUpperCase()
                          const canRemove = canManageAttachments || (currentUserId && attachment.uploaded_by === currentUserId)
                          return (
                            <div
                              key={attachment.id}
                              className="relative text-left border border-zinc-200 rounded-lg overflow-hidden hover:border-zinc-300 hover:shadow-sm transition-all bg-white"
                            >
                              {canRemove && (
                                <button
                                  type="button"
                                  onClick={() => deleteAttachment(attachment)}
                                  className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full bg-zinc-900/80 text-white text-xs flex items-center justify-center shadow hover:bg-rose-600 transition-colors"
                                  aria-label="Delete attachment"
                                  title="Delete attachment"
                                >
                                  ✕
                                </button>
                              )}
                              <div className="aspect-video bg-zinc-100 flex items-center justify-center">
                                {isImage ? (
                                  <button type="button" onClick={() => window.open(attachment.image_url, '_blank')} className="w-full h-full">
                                    <img src={attachment.image_url} alt={attachment.caption || attachment.filename || 'Ticket attachment'} className="w-full h-full object-cover" />
                                  </button>
                                ) : isVideo ? (
                                  <video src={attachment.image_url} controls className="w-full h-full bg-black" />
                                ) : isAudio ? (
                                  <audio src={attachment.image_url} controls className="w-3/4" />
                                ) : (
                                  <a href={attachment.image_url} target="_blank" rel="noopener noreferrer" download={attachment.filename || undefined}
                                    className="flex flex-col items-center justify-center gap-2 text-zinc-500 hover:text-zinc-900 transition-colors p-6 text-center">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    <span className="text-xs font-semibold">{kindLabel}</span>
                                    <span className="text-[10px] text-zinc-400">Click to open or download</span>
                                  </a>
                                )}
                              </div>
                              <div className="p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-semibold text-zinc-900 line-clamp-1">{attachment.caption || attachment.filename || `Ticket ${kindLabel.toLowerCase()}`}</p>
                                  <div className="flex items-center gap-1 flex-shrink-0">
                                    <span className="text-[9px] font-semibold bg-zinc-100 text-zinc-600 px-1.5 py-0.5 rounded uppercase">{kindLabel}</span>
                                    {attachment.is_internal && <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase">Internal</span>}
                                  </div>
                                </div>
                                <p className="text-xs text-zinc-400 mt-1">
                                  {attachment.uploaded_by_name || 'Uploaded'} / {attachment.created_date}
                                </p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Notes Tab ── */}
                {activeTab === 'notes' && (
                  <div>
                    <div className="p-6">
                      {filterCounts.comments === 0 ? (
                        <p className="text-sm text-zinc-400 py-10 text-center">No notes yet — add one below</p>
                      ) : (
                        <div className="space-y-4">
                          {allTimelineItems.filter(i => i.type === 'comment').map((item, idx) => {
                            const comment = item.data as Comment
                            const timeStr = item.time.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
                            return (
                              <div key={idx} className={`border rounded-lg p-4 ${comment.is_internal ? 'border-indigo-100 bg-indigo-50/20' : 'border-zinc-100 bg-zinc-50/30'}`}>
                                <div className="flex items-center gap-2 mb-3">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-semibold ${comment.is_internal ? 'bg-indigo-100 text-indigo-700' : 'bg-zinc-100 text-zinc-600'}`}>{getInitials(comment.author_name)}</div>
                                  <span className="text-xs font-semibold text-zinc-900">{comment.author_name}</span>
                                  {comment.is_internal && <span className="text-[9px] font-semibold bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded uppercase">Internal</span>}
                                  {isPortalComment(comment) && <span className="text-[9px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase">Portal comment</span>}
                                  <span className="text-[10px] text-zinc-300 tabular-nums ml-auto">{timeStr}</span>
                                  {canDeleteComment(comment) && (
                                    <button type="button" onClick={() => deleteComment(comment.id)} title="Delete note"
                                      className="text-zinc-300 hover:text-red-600 transition-colors">
                                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                      </svg>
                                    </button>
                                  )}
                                </div>
                                <div className="max-w-prose"><CommentContent content={comment.body} /></div>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    {/* Note composer */}
                    <div className="px-6 py-4 bg-zinc-50/50 border-t border-zinc-100">
                      <form onSubmit={addComment}>
                        <textarea data-ai-target="ticket-comment" aria-label="Ticket comment or internal note" value={newComment} onChange={e => setNewComment(e.target.value)}
                          placeholder={isInternal ? 'Write an internal note...' : 'Write a client-visible note...'}
                          className={`w-full border rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 resize-none transition-colors ${isInternal ? 'border-indigo-200 bg-indigo-50/20 focus:ring-indigo-400/20 placeholder:text-indigo-300' : 'border-zinc-200 bg-white focus:ring-blue-500/20 placeholder:text-zinc-300'}`}
                          rows={2} />
                        <div className="flex items-center justify-between gap-3 mt-2">
                          <div className="inline-flex bg-zinc-100/80 rounded-md p-0.5">
                            <button type="button" data-ai-target="ticket-comment-client" onClick={() => { setIsInternal(false); setVisibilityTouched(true) }}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${!isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Client
                            </button>
                            <button type="button" data-ai-target="ticket-comment-internal" onClick={() => { setIsInternal(true); setVisibilityTouched(true) }}
                              className={`text-[10px] font-medium px-2.5 py-1 rounded transition-all ${isInternal ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'}`}>
                              Internal
                            </button>
                          </div>
                          <div className="flex items-center gap-2">
                            {(ticket.status === 'new' || ticket.status === 'on_hold') && (
                              <button type="button" onClick={(e) => addComment(e as unknown as FormEvent, 'in_progress')}
                                disabled={submitting || !newComment.trim()}
                                title="Post this note and move the ticket to In Progress — sends one notification"
                                className="border border-amber-200 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-amber-100 disabled:opacity-30 transition-all">
                                {submitting ? 'Posting...' : 'Post & In Progress'}
                              </button>
                            )}
                            {ticket.status !== 'closed' && (
                              <button type="button" onClick={(e) => addComment(e as unknown as FormEvent, 'close')}
                                disabled={submitting || !newComment.trim()}
                                title="Post this note and close the ticket — sends one notification"
                                className="border border-emerald-200 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-emerald-100 disabled:opacity-30 transition-all">
                                {submitting ? 'Posting...' : 'Post & Close'}
                              </button>
                            )}
                            <button type="submit" data-ai-target="ticket-comment-submit" disabled={submitting || !newComment.trim()}
                              className="bg-zinc-900 text-white px-4 py-1.5 rounded-md text-xs font-semibold hover:bg-zinc-800 disabled:opacity-30 transition-all">
                              {submitting ? 'Posting...' : 'Add Note'}
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── RIGHT SIDEBAR: Related Objects (SF-style) ── */}
          {relatedPanelOpen && <div className="w-full lg:w-64 lg:min-w-[256px] flex-shrink-0 space-y-3">
            {[
              {
                title: 'Related Cases',
                icon: 'RC',
                items: relatedTickets,
                render: (item: any) => (
                  <Link key={item.id} href={`/tickets/${item.id}`} className="flex items-center gap-2 py-1.5 px-2 text-xs hover:bg-zinc-50 rounded transition-colors">
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      item.priority === 'critical' ? 'bg-red-500' : item.priority === 'high' ? 'bg-orange-500' : 'bg-zinc-300'
                    }`}></span>
                    <span className="text-zinc-700 truncate">{item.title}</span>
                  </Link>
                ),
              },
              {
                title: 'Dev Tickets',
                icon: 'DT',
                items: relatedTickets.filter((t: any) => t.ticket_type === 'dev_ticket'),
                render: (item: any) => (
                  <Link key={item.id} href={`/tickets/${item.id}`} className="flex items-center gap-2 py-1.5 px-2 text-xs hover:bg-zinc-50 rounded transition-colors">
                    <span className="text-violet-500 text-[10px]">●</span>
                    <span className="text-zinc-700 truncate">{item.title}</span>
                  </Link>
                ),
              },
            ].map((panel) => (
              <details key={panel.title} open className="group">
                <summary className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white border border-zinc-200 cursor-pointer select-none shadow-sm hover:border-zinc-300 transition-colors">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-zinc-100 text-zinc-600 text-[10px] font-bold flex items-center justify-center">{panel.icon}</span>
                    <span className="text-zinc-900 text-xs font-semibold">{panel.title}</span>
                    <span className="text-[10px] text-zinc-400">{panel.items.length}</span>
                  </div>
                  <svg className="w-3.5 h-3.5 text-zinc-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="mt-1 bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-sm">
                  {panel.items.length > 0 ? (
                    <div className="divide-y divide-zinc-100">
                      {panel.items.map(panel.render)}
                    </div>
                  ) : (
                    <p className="text-[11px] text-zinc-400 text-center py-3">None</p>
                  )}
                </div>
              </details>
            ))}

            {/* Venue Equipment */}
            <details open className="group">
              <summary className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white border border-zinc-200 cursor-pointer select-none shadow-sm hover:border-zinc-300 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-blue-50 text-blue-700 text-[10px] font-bold flex items-center justify-center">AS</span>
                  <span className="text-zinc-900 text-xs font-semibold">Account Assets</span>
                </div>
                <svg className="w-3.5 h-3.5 text-zinc-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-1 bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-sm">
                <Link href={`/venues/${ticket.venue_id}`} className="flex items-center gap-2 py-2 px-3 text-xs text-blue-600 hover:bg-zinc-50 transition-colors">
                  View {ticket.venue_name} assets →
                </Link>
              </div>
            </details>

            {/* Parts */}
            <details open className="group">
              <summary className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-white border border-zinc-200 cursor-pointer select-none shadow-sm hover:border-zinc-300 transition-colors">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-red-50 text-red-700 text-[10px] font-bold flex items-center justify-center">PT</span>
                  <span className="text-zinc-900 text-xs font-semibold">Parts</span>
                  <span className="text-[10px] text-zinc-400">0</span>
                </div>
                <svg className="w-3.5 h-3.5 text-zinc-400 group-open:rotate-180 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </summary>
              <div className="mt-1 bg-white rounded-lg border border-zinc-200 overflow-hidden shadow-sm">
                <p className="text-[11px] text-zinc-400 text-center py-3">None</p>
              </div>
            </details>
          </div>}
        </div>
      </div>

      {showMergeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowMergeModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-zinc-200">
              <h3 className="text-sm font-semibold text-zinc-900">Merge this ticket into another</h3>
              <p className="text-xs text-zinc-500 mt-1">Pick the primary ticket. Comments will move to it; this ticket will be closed with a link back.</p>
            </div>
            <div className="px-5 py-3 border-b border-zinc-200">
              <input
                type="text"
                autoFocus
                value={mergeQuery}
                onChange={(e) => setMergeQuery(e.target.value)}
                placeholder="Search by ticket number, title, or venue..."
                className="w-full border border-zinc-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
              />
            </div>
            <div className="flex-1 overflow-auto">
              {mergeCandidates
                .filter((t) => {
                  const q = mergeQuery.toLowerCase().trim()
                  if (!q) return true
                  return (
                    String(t.ticket_number).includes(q) ||
                    t.title.toLowerCase().includes(q) ||
                    (t.venue_name || '').toLowerCase().includes(q)
                  )
                })
                .slice(0, 40)
                .map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => doMerge(t.id)}
                    disabled={merging}
                    className="w-full text-left px-5 py-3 hover:bg-blue-50 border-b border-zinc-100 last:border-b-0 disabled:opacity-50"
                  >
                    <div className="text-xs text-zinc-500 font-mono">T-{String(t.ticket_number).padStart(5, '0')}</div>
                    <div className="text-sm text-zinc-900 mt-0.5 truncate">{t.title}</div>
                    {t.venue_name && <div className="text-xs text-zinc-500 mt-0.5">{t.venue_name}</div>}
                  </button>
                ))}
              {mergeCandidates.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-zinc-500">No open tickets available to merge into.</div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-zinc-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowMergeModal(false)}
                className="px-3 py-1.5 text-xs text-zinc-600 hover:text-zinc-900"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </TicketFrame>
  )
}

function TicketFrame({ embedded, children }: { embedded: boolean; children: React.ReactNode }) {
  return embedded ? <>{children}</> : <DashboardLayout>{children}</DashboardLayout>
}
