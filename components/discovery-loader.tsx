'use client'

interface DiscoveryLoaderProps {
  title: string
  subtitle: string
  hints?: string[]
  compact?: boolean
}

export function DiscoveryLoader({ title, subtitle, hints = [], compact = false }: DiscoveryLoaderProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-white/60 bg-white/55 shadow-[0_24px_80px_rgba(15,23,42,0.10)] backdrop-blur-xl ${compact ? 'p-5' : 'p-6'}`}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          background: 'linear-gradient(135deg, rgba(10,82,239,0.10) 0%, rgba(255,255,255,0.18) 35%, rgba(16,185,129,0.10) 100%)',
        }}
      />

      <div
        aria-hidden="true"
        className="absolute -left-10 top-0 h-28 w-28 rounded-full bg-blue-400/15 blur-2xl animate-pulse"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 right-0 h-24 w-24 rounded-full bg-emerald-400/15 blur-2xl animate-pulse"
      />

      <div className="relative flex items-start gap-4">
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-white/70 bg-white/70 shadow-sm">
          <div className="absolute h-8 w-8 rounded-full border-2 border-blue-200/80" />
          <div className="absolute h-8 w-8 rounded-full border-2 border-transparent border-t-[#0A52EF] border-r-[#0A52EF] animate-spin" />
          <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_18px_rgba(16,185,129,0.75)]" />
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold tracking-[0.18em] text-zinc-900 uppercase">{title}</h3>
          <p className="mt-1 text-sm text-zinc-600">{subtitle}</p>

          <div className="mt-4 grid grid-cols-3 gap-2">
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="h-1.5 overflow-hidden rounded-full bg-white/70">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#0A52EF] via-sky-400 to-emerald-400 animate-pulse"
                  style={{ width: `${55 + idx * 15}%` }}
                />
              </div>
            ))}
          </div>

          {hints.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {hints.map((hint) => (
                <span
                  key={hint}
                  className="rounded-full border border-white/70 bg-white/60 px-2.5 py-1 text-[11px] font-medium text-zinc-600 backdrop-blur"
                >
                  {hint}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
