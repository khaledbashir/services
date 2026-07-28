'use client'

import Link from 'next/link'
import PortalShell from '../PortalShell'

const VIDEO_GUIDES = [
  {
    src: '/orientation-videos/getting-started.mp4',
    poster: '/orientation-videos/getting-started-poster.jpg',
    title: 'Getting started',
    blurb: 'Your invitation, first sign-in, and a tour of your overview.',
  },
  {
    src: '/orientation-videos/submitting-a-request.mp4',
    poster: '/orientation-videos/submitting-a-request-poster.jpg',
    title: 'Submitting a request',
    blurb: 'Pick a category and specific issue so your request reaches the right technician.',
  },
  {
    src: '/orientation-videos/tracking-your-request.mp4',
    poster: '/orientation-videos/tracking-your-request-poster.jpg',
    title: 'Following your request',
    blurb: 'Status, replies from the ANC team, and the final resolution — all in one thread.',
  },
  {
    src: '/orientation-videos/venue-hub.mp4',
    poster: '/orientation-videos/venue-hub-poster.jpg',
    title: 'Your venue hub',
    blurb: 'Service health, shared documents, approvals, and your service reports.',
  },
]

const STEPS = [
  ['File requests', 'Use Requests or AI Diagnosis for display issues, content concerns, service questions, or event-readiness items.'],
  ['Track work', 'Open requests show status, priority, venue, replies, and resolution history without digging through email.'],
  ['Use documents', 'ANC-shared reports, drawings, proof packages, specs, and reference files stay organized by venue.'],
  ['Escalate cleanly', 'Urgent service items should be filed as high or urgent so the ANC support path is triggered.'],
]

function OrientationContent() {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="cp-page-title">Orientation</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--anc-muted)' }}>
          How the client should use the portal, what each area is for, and where service work starts.
        </p>
      </div>
      <div className="mb-8">
        <h2 className="cp-section-title mb-3">Video guides</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {VIDEO_GUIDES.map(video => (
            <div key={video.src} className="cp-panel overflow-hidden">
              <video
                controls
                preload="none"
                poster={video.poster}
                src={video.src}
                style={{ width: '100%', display: 'block', aspectRatio: '16 / 10', background: '#0b1220' }}
              />
              <div className="p-4">
                <h3 className="text-sm font-semibold">{video.title}</h3>
                <p className="mt-1 text-xs leading-5" style={{ color: 'var(--anc-muted)' }}>{video.blurb}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {STEPS.map(([title, body], index) => (
          <div key={title} className="cp-panel p-5">
            <div className="cp-stat-label">Step {index + 1}</div>
            <h2 className="mt-2 text-lg font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6" style={{ color: 'var(--anc-muted)' }}>{body}</p>
          </div>
        ))}
      </div>
      <div className="cp-panel mt-6 p-6">
        <h2 className="cp-section-title mb-3">Start here</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/customer/requests?new=1" className="cp-btn">Create request</Link>
          <Link href="/customer/diagnosis" className="cp-btn-ghost">Run diagnosis</Link>
          <Link href="/customer/documents" className="cp-btn-ghost">Open documents</Link>
        </div>
      </div>
    </div>
  )
}

export default function CustomerOrientationPage() {
  return (
    <PortalShell active="Orientation">
      <OrientationContent />
    </PortalShell>
  )
}
