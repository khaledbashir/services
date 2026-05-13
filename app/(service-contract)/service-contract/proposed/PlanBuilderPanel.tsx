'use client'

import { useMemo, useState } from 'react'
import {
  BASE_RATE, HOUR_BANDS, UNLOCKS,
  bandForHours, rateForHours, fmtUSD,
} from './catalog-data'

const BAND_RING: Record<string, string> = {
  slate:   'from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-900 border-slate-300 dark:border-slate-700',
  blue:    'from-blue-100 to-white dark:from-blue-950 dark:to-gray-900 border-blue-300 dark:border-blue-800',
  indigo:  'from-indigo-100 to-white dark:from-indigo-950 dark:to-gray-900 border-indigo-300 dark:border-indigo-800',
  purple:  'from-purple-100 to-white dark:from-purple-950 dark:to-gray-900 border-purple-300 dark:border-purple-800',
  emerald: 'from-emerald-100 via-blue-50 to-white dark:from-emerald-950 dark:via-blue-950/40 dark:to-gray-900 border-emerald-300 dark:border-emerald-700',
}

const BAND_TEXT: Record<string, string> = {
  slate:   'text-slate-700 dark:text-slate-300',
  blue:    'text-blue-700 dark:text-blue-300',
  indigo:  'text-indigo-700 dark:text-indigo-300',
  purple:  'text-purple-700 dark:text-purple-300',
  emerald: 'text-emerald-700 dark:text-emerald-300',
}

const MAX_HOURS = 75

export default function PlanBuilderPanel() {
  const [hours, setHours] = useState(24)

  const band = bandForHours(hours)
  const rate = rateForHours(hours)
  const monthly = hours * rate
  const annual = monthly * 12
  const baselineMonthly = hours * BASE_RATE
  const savedMonthly = baselineMonthly - monthly
  const savedAnnual = savedMonthly * 12

  const unlocks = useMemo(() => UNLOCKS.map(u => ({ ...u, active: hours >= u.atHours })), [hours])
  const activeUnlocks = unlocks.filter(u => u.active).length
  const totalUnlocks = unlocks.length

  // Position of each unlock marker on the slider (0–100%)
  const markerPct = (h: number) => Math.min(100, (h / MAX_HOURS) * 100)

  return (
    <section>
      <div className="mb-6">
        <div className="text-xs uppercase tracking-widest text-gray-500 mb-1">🎮 Build your own plan</div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">Slide. Watch the rate drop. Unlock perks.</h2>
        <p className="text-sm text-gray-500 max-w-2xl">
          Base rate is <strong className="text-gray-900 dark:text-gray-100">${BASE_RATE}/hr</strong>. The more hours you commit
          per month, the lower the per-hour rate, and the more perks unlock automatically.
        </p>
      </div>

      {/* HERO — big rate + total */}
      <div className={`rounded-2xl border-2 bg-gradient-to-br ${BAND_RING[band.color]} p-6 mb-6 transition-all`}>
        <div className="flex items-start justify-between gap-6 flex-wrap mb-6">
          <div>
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/80 dark:bg-gray-900/80 border ${BAND_TEXT[band.color]} text-xs font-bold uppercase tracking-widest`}>
              <span className="text-base">{band.emoji}</span>
              <span>{band.badge} Tier</span>
            </div>
            <p className={`text-sm mt-2 ${BAND_TEXT[band.color]} font-medium`}>{band.tagline}</p>
          </div>
          <div className="text-right">
            <div className="text-[11px] uppercase tracking-widest text-gray-500 font-semibold">Your rate</div>
            <div className="text-5xl font-extrabold tabular-nums text-gray-900 dark:text-gray-100 leading-none">
              ${rate}<span className="text-2xl text-gray-500">/hr</span>
            </div>
            {savedMonthly > 0 && (
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-1">
                ↓ ${BASE_RATE - rate}/hr off base
              </div>
            )}
          </div>
        </div>

        {/* THE SLIDER */}
        <div className="relative pt-2 pb-12">
          {/* Unlock markers above the track */}
          <div className="absolute top-0 left-0 right-0 h-2 pointer-events-none">
            {UNLOCKS.map(u => (
              <div
                key={u.atHours}
                className="absolute -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${markerPct(u.atHours)}%` }}
              >
                <div className={`text-lg transition-all ${hours >= u.atHours ? 'opacity-100 scale-110' : 'opacity-30 scale-90 grayscale'}`}>
                  {u.icon}
                </div>
              </div>
            ))}
          </div>

          {/* Track */}
          <input
            type="range"
            min={1}
            max={MAX_HOURS}
            step={1}
            value={hours}
            onChange={(e) => setHours(parseInt(e.target.value))}
            className="w-full h-3 mt-8 appearance-none rounded-full bg-gray-200 dark:bg-gray-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0A52EF]
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-6
              [&::-webkit-slider-thumb]:h-6
              [&::-webkit-slider-thumb]:rounded-full
              [&::-webkit-slider-thumb]:bg-[#0A52EF]
              [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:border-2
              [&::-webkit-slider-thumb]:border-white
              [&::-webkit-slider-thumb]:cursor-grab
              [&::-webkit-slider-thumb]:active:cursor-grabbing
              [&::-moz-range-thumb]:w-6
              [&::-moz-range-thumb]:h-6
              [&::-moz-range-thumb]:rounded-full
              [&::-moz-range-thumb]:bg-[#0A52EF]
              [&::-moz-range-thumb]:border-2
              [&::-moz-range-thumb]:border-white"
            style={{
              background: `linear-gradient(to right, #0A52EF 0%, #0A52EF ${markerPct(hours)}%, ${typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? '#1f2937' : '#e5e7eb'} ${markerPct(hours)}%, ${typeof document !== 'undefined' && document.documentElement.classList.contains('dark') ? '#1f2937' : '#e5e7eb'} 100%)`,
            }}
          />

          {/* Band labels below the track */}
          <div className="absolute left-0 right-0 bottom-0 h-8 pointer-events-none text-[10px] uppercase tracking-widest font-bold">
            {HOUR_BANDS.map(b => (
              <div
                key={b.minHours}
                className="absolute -translate-x-1/2 flex flex-col items-center"
                style={{ left: `${markerPct(b.minHours)}%` }}
              >
                <div className={`w-px h-2 ${hours >= b.minHours ? 'bg-[#0A52EF]' : 'bg-gray-300 dark:bg-gray-700'}`} />
                <span className={`mt-1 ${hours >= b.minHours ? BAND_TEXT[b.color] : 'text-gray-400 dark:text-gray-600'}`}>
                  ${b.rate}
                </span>
              </div>
            ))}
            <div className="absolute right-0 -translate-x-0 flex flex-col items-end">
              <span className="text-gray-400 text-[10px]">{MAX_HOURS}h+</span>
            </div>
          </div>
        </div>

        {/* Live readout cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
          <Readout label="Hours / month" value={`${hours}h`} accent="brand" />
          <Readout label="Monthly" value={fmtUSD(monthly)} accent="gray" />
          <Readout label="Annual" value={fmtUSD(annual)} accent="gray" />
          <Readout
            label="You save"
            value={savedMonthly > 0 ? `${fmtUSD(savedMonthly)}/mo` : '$0/mo'}
            sub={savedAnnual > 0 ? `${fmtUSD(savedAnnual)}/yr off base` : 'at base rate'}
            accent={savedMonthly > 0 ? 'success' : 'gray'}
          />
        </div>
      </div>

      {/* UNLOCK GRID */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold uppercase tracking-widest text-gray-500">Perks unlocked</h3>
          <div className="text-xs">
            <span className="font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{activeUnlocks}</span>
            <span className="text-gray-500"> of {totalUnlocks} unlocked</span>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {unlocks.map(u => (
            <UnlockCard key={u.atHours} unlock={u} />
          ))}
        </div>
      </div>

      {/* WOW MOMENT — Bundle C unlock celebration */}
      {hours >= 50 && (
        <div className="rounded-2xl border-2 border-emerald-400 dark:border-emerald-600 bg-gradient-to-r from-emerald-50 via-blue-50 to-emerald-50 dark:from-emerald-950/40 dark:via-blue-950/40 dark:to-emerald-950/40 p-5 shadow-xl animate-[fadeIn_0.4s_ease-out]">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">🎉</span>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-emerald-700 dark:text-emerald-300 font-bold">WOW unlocked</div>
              <h4 className="text-lg font-bold text-gray-900 dark:text-gray-100">You just qualified for Bundle C — the Operator+ Wow Bundle</h4>
            </div>
          </div>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            At {hours}h/month × ${rate}/hr × 12 months = <strong>{fmtUSD(annual)}/year</strong>, with Charlie Full Operator
            (worth $18,000) bundled in for free, same-day SLA, and quarterly operator training. This is the &quot;one number,
            zero surprises&quot; tier — Joe + Jireh sign off once and stop thinking about hours.
          </p>
        </div>
      )}

      {/* HOW IT WORKS */}
      <div className="mt-6 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-4 bg-gray-50/40 dark:bg-gray-900/40">
        <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-2">How the volume discount works</div>
        <div className="grid sm:grid-cols-5 gap-2">
          {HOUR_BANDS.map(b => (
            <div key={b.minHours} className="rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 p-2 text-center">
              <div className={`text-base ${BAND_TEXT[b.color]}`}>{b.emoji}</div>
              <div className="text-[10px] uppercase tracking-widest text-gray-500 mt-1">{b.minHours}h+</div>
              <div className="text-base font-extrabold tabular-nums text-gray-900 dark:text-gray-100">${b.rate}</div>
              <div className="text-[10px] text-gray-500">{b.badge}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-3 italic">
          The rate applies to all hours in that band — not just the marginal hour. So at 30h/mo you pay $70 for all 30 hours, not $90 for the first 8 and $70 for the rest.
        </p>
      </div>
    </section>
  )
}

function Readout({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent: 'gray' | 'success' | 'brand' }) {
  const tones: Record<string, string> = {
    gray: 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700',
    success: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
    brand: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
  }
  const textTones: Record<string, string> = {
    gray: 'text-gray-900 dark:text-gray-100',
    success: 'text-emerald-700 dark:text-emerald-300',
    brand: 'text-blue-700 dark:text-blue-300',
  }
  return (
    <div className={`rounded-xl border ${tones[accent]} p-3`}>
      <div className="text-[10px] uppercase tracking-widest font-bold text-gray-500 dark:text-gray-400">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums mt-0.5 ${textTones[accent]}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function UnlockCard({ unlock }: { unlock: typeof UNLOCKS[number] & { active: boolean } }) {
  return (
    <div
      className={`relative rounded-xl border-2 p-3 transition-all duration-300 ${
        unlock.active
          ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-md'
          : 'border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 opacity-60'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`text-2xl ${unlock.active ? '' : 'grayscale opacity-50'}`}>{unlock.icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${unlock.active ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}`}>
              {unlock.label}
            </span>
            {unlock.active && <span className="text-[9px] uppercase tracking-widest font-bold text-emerald-600 dark:text-emerald-400">✓ Unlocked</span>}
          </div>
          <p className={`text-[11px] mt-0.5 ${unlock.active ? 'text-gray-600 dark:text-gray-400' : 'text-gray-500'}`}>
            {unlock.description}
          </p>
          {unlock.worth && (
            <div className={`text-[10px] mt-1 font-semibold ${unlock.active ? 'text-emerald-700 dark:text-emerald-300' : 'text-gray-400'}`}>
              {unlock.worth}
            </div>
          )}
        </div>
      </div>
      {!unlock.active && (
        <div className="absolute top-2 right-2 text-[9px] uppercase tracking-widest font-bold text-gray-400">
          🔒 {unlock.atHours}h
        </div>
      )}
    </div>
  )
}
