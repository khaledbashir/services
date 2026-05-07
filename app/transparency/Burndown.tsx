interface Props {
  days: Array<{ day: number; hours_cum: number; pace_cum: number }>
  cap: number
  daysInMonth: number
}

export default function Burndown({ days, cap, daysInMonth }: Props) {
  if (!days.length) return null
  const W = 280
  const H = 60
  const padX = 6
  const padY = 4
  const innerW = W - padX * 2
  const innerH = H - padY * 2

  const xFor = (day: number) => padX + ((day - 1) / Math.max(daysInMonth - 1, 1)) * innerW
  const yFor = (hrs: number) => padY + innerH - Math.min(hrs / cap, 1) * innerH

  // Build a smooth-ish path for hours_cum
  const actualPath = days
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(d.day).toFixed(1)} ${yFor(d.hours_cum).toFixed(1)}`)
    .join(' ')

  // Pace line — straight from (1, paceFor1) to (last, paceForLast)
  const paceFromX = xFor(1)
  const paceFromY = yFor(days[0]?.pace_cum ?? 0)
  const paceToX = xFor(days[days.length - 1].day)
  const paceToY = yFor(days[days.length - 1].pace_cum)

  const lastDay = days[days.length - 1]
  const overPace = lastDay.hours_cum > lastDay.pace_cum

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400 font-semibold">
          Burndown · day {lastDay.day}
        </span>
        <span className={`text-[10px] font-mono tabular-nums ${overPace ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {overPace ? '▲ heavier than pace' : '✓ on or under pace'}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        {/* Cap line */}
        <line
          x1={padX}
          x2={W - padX}
          y1={yFor(cap)}
          y2={yFor(cap)}
          stroke="currentColor"
          strokeOpacity="0.15"
          strokeDasharray="2,3"
          className="text-zinc-500"
        />
        {/* Pace line */}
        <line
          x1={paceFromX}
          x2={paceToX}
          y1={paceFromY}
          y2={paceToY}
          stroke="currentColor"
          strokeWidth="1"
          strokeOpacity="0.4"
          strokeDasharray="3,2"
          className="text-zinc-500"
        />
        {/* Actual path */}
        <path
          d={actualPath}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={overPace ? 'text-amber-500' : 'text-blue-500'}
        />
        {/* End-cap dot */}
        <circle
          cx={xFor(lastDay.day)}
          cy={yFor(lastDay.hours_cum)}
          r="2.5"
          fill="currentColor"
          className={overPace ? 'text-amber-500' : 'text-blue-500'}
        />
      </svg>
      <div className="flex items-center gap-3 text-[9px] text-zinc-500 dark:text-zinc-400 mt-0.5">
        <span className="flex items-center gap-1">
          <span className={`inline-block w-2 h-0.5 ${overPace ? 'bg-amber-500' : 'bg-blue-500'}`} /> actual
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-0.5 border-t border-dashed border-zinc-500" /> pace
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <span className="font-mono tabular-nums">
            {lastDay.hours_cum.toFixed(1)}h / {cap}h cap
          </span>
        </span>
      </div>
    </div>
  )
}
