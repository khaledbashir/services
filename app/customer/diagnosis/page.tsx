'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import PortalShell, { usePortal } from '../PortalShell'

type DiagnosisResult = {
  likelyIssue: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  steps: string[]
}

function diagnose(summary: string): DiagnosisResult {
  const text = summary.toLowerCase()
  if (text.includes('black') || text.includes('blank') || text.includes('off')) {
    return {
      likelyIssue: 'Possible LED module, power, or data path interruption',
      priority: 'high',
      steps: ['Attach a wide venue photo and close-up photo', 'Confirm whether the issue is constant or intermittent', 'ANC should inspect cabinet power/data path'],
    }
  }
  if (text.includes('frozen') || text.includes('stuck') || text.includes('not updating')) {
    return {
      likelyIssue: 'Playback or control-system signal issue',
      priority: 'medium',
      steps: ['Try the approved playback restart sequence', 'Note the content source and time observed', 'ANC should review control-room signal chain'],
    }
  }
  if (text.includes('color') || text.includes('dim') || text.includes('brightness')) {
    return {
      likelyIssue: 'Calibration, brightness, or color profile mismatch',
      priority: 'medium',
      steps: ['Capture photo from normal seating distance', 'Note whether it affects all content or one source', 'ANC should compare calibration profile and panel history'],
    }
  }
  return {
    likelyIssue: 'Needs ANC service review',
    priority: 'medium',
    steps: ['Attach the clearest photo available', 'Include exact display location', 'ANC will classify and route the request'],
  }
}

function DiagnosisContent() {
  const { venues, selectedVenueId } = usePortal()
  const [venueId, setVenueId] = useState('')
  const [summary, setSummary] = useState('')
  const [photoName, setPhotoName] = useState('')
  const [result, setResult] = useState<DiagnosisResult | null>(null)
  const [created, setCreated] = useState<{ id: string; ticket_number: number } | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (selectedVenueId && selectedVenueId !== 'all') {
      setVenueId(selectedVenueId)
    } else if (venues.length === 1) {
      setVenueId(venues[0].id)
    }
  }, [selectedVenueId, venues])

  const availableVenues = selectedVenueId && selectedVenueId !== 'all'
    ? venues.filter((venue) => venue.id === selectedVenueId)
    : venues

  function runDiagnosis() {
    setCreated(null)
    setError('')
    setResult(diagnose(summary))
  }

  async function createTicket() {
    if (!result) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/customer/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venueId,
          title: `AI diagnosis: ${result.likelyIssue}`,
          priority: result.priority,
          category: 'diagnosis',
          description: [
            summary,
            photoName ? `Photo reference: ${photoName}` : '',
            `AI first read: ${result.likelyIssue}`,
            `Suggested steps: ${result.steps.join('; ')}`,
          ].filter(Boolean).join('\n\n'),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Could not create service request')
        return
      }
      setCreated(data.ticket)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="cp-page-title">AI Diagnosis</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          First-line issue intake for display photos, symptoms, and routing into a real ANC service request.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="cp-panel p-6">
          <div className="space-y-5">
            <div>
              <label className="cp-label">Venue</label>
              <select value={venueId} onChange={e => setVenueId(e.target.value)} className="cp-input">
                <option value="">Select venue...</option>
                {availableVenues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select>
            </div>
            <div>
              <label className="cp-label">What are you seeing?</label>
              <textarea
                value={summary}
                onChange={e => setSummary(e.target.value)}
                className="cp-input"
                rows={6}
                placeholder="Example: North ribbon board has intermittent black panels during playback."
              />
            </div>
            <div>
              <label className="cp-label">Photo reference</label>
              <input
                type="file"
                accept="image/*"
                className="cp-input"
                onChange={e => setPhotoName(e.target.files?.[0]?.name || '')}
              />
            </div>
            {error && <div className="cp-error">{error}</div>}
            <div className="flex flex-wrap gap-3">
              <button type="button" className="cp-btn" disabled={!summary.trim()} onClick={runDiagnosis}>
                Run diagnosis
              </button>
              <button type="button" className="cp-btn-ghost" onClick={() => { setSummary(''); setResult(null); setCreated(null); setPhotoName('') }}>
                Clear
              </button>
            </div>
          </div>
        </div>

        <aside className="cp-panel p-6">
          <h2 className="cp-section-title mb-4">Readout</h2>
          {!result ? (
            <p className="text-sm" style={{ color: 'var(--anc-muted)' }}>
              Add symptoms and run diagnosis. The readout can become a real service request.
            </p>
          ) : (
            <div className="space-y-4">
              <div>
                <div className="cp-stat-label">Likely issue</div>
                <div className="mt-1 text-lg font-semibold">{result.likelyIssue}</div>
              </div>
              <div>
                <span className={`cp-chip p-${result.priority}`}>{result.priority}</span>
              </div>
              <div>
                <div className="cp-stat-label mb-2">Next steps</div>
                <div className="space-y-2">
                  {result.steps.map(step => (
                    <div key={step} className="flex gap-2 text-sm">
                      <span className="cp-led is-work mt-1.5" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </div>
              {created ? (
                <Link href={`/customer/tickets/${created.id}`} className="cp-btn inline-flex">
                  View #{String(created.ticket_number).padStart(8, '0')}
                </Link>
              ) : (
                <button type="button" className="cp-btn w-full" disabled={!venueId || submitting} onClick={() => void createTicket()}>
                  {submitting ? 'Creating...' : 'Create service request'}
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}

export default function CustomerDiagnosisPage() {
  return (
    <PortalShell active="AI Diagnosis">
      <DiagnosisContent />
    </PortalShell>
  )
}
