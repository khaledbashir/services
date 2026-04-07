'use client'

interface DiscoveryReviewCardProps {
  summary: string
  eventDate: string
  startTime: string | null
  endTime?: string | null
  venueName?: string
  eventType: string
  league?: string | null
  sourceLabel?: string | null
  sourceUrl?: string | null
  trustScore?: number
  confidence: number
  duplicate: boolean
  duplicateReason?: string | null
  selected: boolean
  disabled?: boolean
  checkedLabel?: string
  subtitle?: string | null
  onToggle: () => void
}

function trustBand(score?: number) {
  const value = typeof score === 'number' ? score : 0
  if (value >= 0.85) return { label: 'High Trust', tone: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
  if (value >= 0.7) return { label: 'Medium Trust', tone: 'bg-amber-50 text-amber-700 border-amber-200' }
  return { label: 'Low Trust', tone: 'bg-zinc-100 text-zinc-600 border-zinc-200' }
}

function eventTypeTone(eventType: string) {
  if (eventType === 'game') return 'bg-blue-50 text-blue-700 border-blue-200'
  if (eventType === 'concert') return 'bg-violet-50 text-violet-700 border-violet-200'
  return 'bg-zinc-50 text-zinc-600 border-zinc-200'
}

function formatDateLabel(dateStr: string) {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function DiscoveryReviewCard(props: DiscoveryReviewCardProps) {
  const trust = trustBand(props.trustScore)
  const timeLabel = props.startTime
    ? `${props.startTime}${props.endTime ? ` - ${props.endTime}` : ''}`
    : 'Time not provided'

  return (
    <label
      className={`block rounded-2xl border transition-all ${
        props.selected ? 'border-[#0A52EF] bg-[#0A52EF]/[0.04] shadow-sm' : 'border-zinc-200 bg-white hover:border-zinc-300'
      } ${props.disabled ? 'opacity-75' : ''}`}
    >
      <div className="flex gap-3 p-4">
        <input
          type="checkbox"
          checked={props.selected}
          disabled={props.disabled}
          onChange={props.onToggle}
          className="mt-1 rounded border-zinc-300 disabled:opacity-40"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="truncate text-sm font-semibold text-zinc-900">{props.summary}</h4>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${eventTypeTone(props.eventType)}`}>
                  {props.eventType}
                </span>
                {props.league && (
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-600">
                    {props.league}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                <span>{formatDateLabel(props.eventDate)}</span>
                <span>•</span>
                <span>{timeLabel}</span>
                {props.venueName && (
                  <>
                    <span>•</span>
                    <span>{props.venueName}</span>
                  </>
                )}
              </div>
              {(props.subtitle || props.sourceLabel) && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                  {props.sourceLabel && (
                    props.sourceUrl ? (
                      <a href={props.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-[#0A52EF] hover:underline" onClick={(e) => e.stopPropagation()}>
                        {props.sourceLabel}
                      </a>
                    ) : (
                      <span className="font-medium text-[#0A52EF]">{props.sourceLabel}</span>
                    )
                  )}
                  {props.subtitle && <span>{props.subtitle}</span>}
                </div>
              )}
            </div>

            <div className="flex flex-col items-start gap-2 sm:items-end">
              <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${trust.tone}`}>
                {trust.label}
              </span>
              <span className="text-[11px] font-medium text-zinc-500">
                {Math.round((props.confidence || 0) * 100)}% confidence
              </span>
              {props.checkedLabel && (
                <span className="text-[11px] font-medium text-zinc-500">{props.checkedLabel}</span>
              )}
            </div>
          </div>

          {props.duplicate && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              Duplicate: {props.duplicateReason || 'already exists'}
            </div>
          )}
        </div>
      </div>
    </label>
  )
}
