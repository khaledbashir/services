'use client'

export function WipBanner() {
  return (
    <div
      role="alert"
      className="sticky top-0 z-40 w-full border-b-4 border-red-700 bg-red-600 text-white shadow-lg"
    >
      <div className="mx-auto flex max-w-screen-xl flex-col items-start gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-md bg-white px-2.5 py-1 text-xs font-black uppercase tracking-wider text-red-700 shadow-sm">
            ⚠ Work in Progress
          </span>
          <p className="text-sm font-semibold leading-tight sm:text-base">
            Demo only — this section is still being built. Data, layouts, and features may change.
          </p>
        </div>
        <span className="hidden rounded bg-red-800/60 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider sm:inline-block">
          Not production-ready
        </span>
      </div>
    </div>
  )
}
