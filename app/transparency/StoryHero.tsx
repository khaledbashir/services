interface Props {
  story: {
    month_label: string
    days_elapsed: number
    days_total: number
    pct_elapsed: number
    pacing_status: 'ahead' | 'on_track' | 'behind' | 'over'
    narrative: string
  }
}

const PACING_TONE: Record<string, { dot: string; label: string; ring: string }> = {
  ahead:    { dot: 'bg-blue-500',    label: 'lighter than pace', ring: 'ring-blue-500/20' },
  on_track: { dot: 'bg-emerald-500', label: 'on pace',           ring: 'ring-emerald-500/20' },
  behind:   { dot: 'bg-amber-500',   label: 'running heavy',     ring: 'ring-amber-500/20' },
  over:     { dot: 'bg-rose-500 animate-pulse', label: 'over cap', ring: 'ring-rose-500/30' },
}

export default function StoryHero({ story }: Props) {
  const tone = PACING_TONE[story.pacing_status] || PACING_TONE.on_track
  return (
    <section className={`rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-white to-zinc-50 dark:from-zinc-900 dark:to-zinc-950 p-6 mb-4 shadow-sm ring-1 ${tone.ring}`}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
            {story.month_label}
          </div>
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mt-0.5">
            How the month is going
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${tone.dot}`} />
          <span className="text-xs font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
            {tone.label}
          </span>
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 tabular-nums ml-2">
            day {story.days_elapsed} of {story.days_total} · {story.pct_elapsed}%
          </span>
        </div>
      </div>

      <p className="text-sm leading-relaxed text-zinc-700 dark:text-zinc-300 max-w-3xl">
        {story.narrative}
      </p>

      {/* Month progress bar */}
      <div className="mt-4 h-1 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-[width] duration-700"
          style={{ width: `${story.pct_elapsed}%` }}
        />
      </div>
    </section>
  )
}
