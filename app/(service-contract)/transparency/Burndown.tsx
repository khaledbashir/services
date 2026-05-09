interface Props {
  days: Array<{ day: number; hours_cum: number; pace_cum: number }>
  cap: number
  daysInMonth: number
}

export default function Burndown({ days, cap, daysInMonth }: Props) {
  if (!days.length) return null
  const W = 280
  const H = 80
  const padX = 24
  const padY = 8
  const innerW = W - padX * 2
  const innerH = H - padY * 2

  const xFor = (day: number) => padX + ((day - 1) / Math.max(daysInMonth - 1, 1)) * innerW
  const yFor = (hrs: number) => padY + innerH - Math.min(hrs / cap, 1) * innerH

  const actualPath = days
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xFor(d.day).toFixed(1)} ${yFor(d.hours_cum).toFixed(1)}`)
    .join(' ')

  // Area fill under actual line
  const areaPath = actualPath + ` L ${xFor(days[days.length - 1].day).toFixed(1)} ${yFor(0).toFixed(1)} L ${xFor(1).toFixed(1)} ${yFor(0).toFixed(1)} Z`

  const paceFromX = xFor(1)
  const paceFromY = yFor(days[0]?.pace_cum ?? 0)
  const paceToX = xFor(days[days.length - 1].day)
  const paceToY = yFor(days[days.length - 1].pace_cum)

  const lastDay = days[days.length - 1]
  const overPace = lastDay.hours_cum > lastDay.pace_cum
  const lineColor = overPace ? '#f59e0b' : '#3b82f6'
  const fillColor = overPace ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)'

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((pct) => ({
    y: yFor(cap * pct),
    label: pct === 0 ? '0' : pct === 1 ? `${cap}h` : `${(cap * pct).toFixed(0)}h`,
  }))

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
        {/* Grid lines */}
        {gridLines.map((g) => (
          <g key={g.label}>
            <line
              x1={padX}
              x2={W - padX}
              y1={g.y}
              y2={g.y}
              stroke="currentColor"
              strokeOpacity="0.08"
              strokeWidth="0.5"
              className="text-zinc-500"
            />
            <text
              x={padX - 3}
              y={g.y + 2.5}
              textAnchor="end"
              fontSize="5"
              className="fill-zinc-400 dark:fill-zinc-500"
              fontFamily="ui-monospace, monospace"
            >
              {g.label}
            </text>
          </g>
        ))}
        {/* Cap line */}
        <line
          x1={padX}
          x2={W - padX}
          y1={yFor(cap)}
          y2={yFor(cap)}
          stroke="currentColor"
          strokeOpacity="0.25"
          strokeDasharray="3,3"
          className="text-zinc-500"
        />
        {/* Area fill under actual */}
        <path
          d={areaPath}
          fill={fillColor}
        />
        {/* Pace line */}
        <line
          x1={paceFromX}
          x2={paceToX}
          y1={paceFromY}
          y2={paceToY}
          stroke="currentColor"
          strokeWidth="1"
          strokeOpacity="0.3"
          strokeDasharray="4,2"
          className="text-zinc-500"
        />
        {/* Actual path */}
        <path
          d={actualPath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* End-cap dot with outer ring */}
        <circle
          cx={xFor(lastDay.day)}
          cy={yFor(lastDay.hours_cum)}
          r="5"
          fill="white"
          fillOpacity="0.9"
          className="dark:fill-zinc-900 dark:fill-opacity-90"
        />
        <circle
          cx={xFor(lastDay.day)}
          cy={yFor(lastDay.hours_cum)}
          r="3"
          fill={lineColor}
        />
      </svg>
      <div className="flex items-center gap-3 text-[9px] text-zinc-500 dark:text-zinc-400 mt-1">
        <span className="flex items-center gap-1">
          <span className={`inline-block w-2 h-0.5 ${overPace ? 'bg-amber-500' : 'bg-blue-500'}`} /> actual
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-0.5 border-t border-dashed border-zinc-500" /> pace
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-sm" /> cap
        </span>
        <span className="flex items-center gap-1 ml-auto font-mono tabular-nums">
          {lastDay.hours_cum.toFixed(1)}h / {cap}h cap
        </span>
      </div>
    </div>
  )
}
