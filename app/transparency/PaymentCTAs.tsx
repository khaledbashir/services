interface Props {
  pendingUrl: string
  topupUrl: string
  rate: number
  hoursRemaining: number
  pctUsed: number
  hasPendingChangeOrder: boolean
}

export default function PaymentCTAs({
  pendingUrl, topupUrl, rate, hoursRemaining, pctUsed, hasPendingChangeOrder,
}: Props) {
  const urgent = pctUsed >= 90
  const sublineTopup = urgent
    ? `${hoursRemaining.toFixed(1)} hrs left this month — top up before overage starts at $${rate}/hr.`
    : `Need a faster turnaround or extra capacity this month? Add hours at $${rate}/hr.`

  return (
    <section className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-sm mb-4" data-no-print="true">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          Payment &amp; top-ups
        </h2>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500">Secure payment via Payoneer</span>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <a
          href={topupUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`group flex items-start gap-3 rounded-xl border p-4 transition-all ${
            urgent
              ? 'border-amber-300 bg-amber-50 hover:border-amber-400 hover:shadow-md dark:border-amber-800 dark:bg-amber-950/40'
              : 'border-blue-300 bg-blue-50 hover:border-blue-400 hover:shadow-md dark:border-blue-800 dark:bg-blue-950/40'
          }`}
        >
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-lg ${urgent ? 'bg-amber-600' : 'bg-blue-600'}`}>
            +
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold ${urgent ? 'text-amber-900 dark:text-amber-100' : 'text-blue-900 dark:text-blue-100'}`}>
              Add retainer hours · ${rate}/hr
            </div>
            <div className={`text-xs mt-0.5 ${urgent ? 'text-amber-700 dark:text-amber-300' : 'text-blue-700 dark:text-blue-300'}`}>
              {sublineTopup}
            </div>
            <div className={`text-[11px] mt-1.5 font-medium ${urgent ? 'text-amber-800 dark:text-amber-200' : 'text-blue-800 dark:text-blue-200'}`}>
              Open Payoneer link →
            </div>
          </div>
        </a>

        <a
          href={pendingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`group flex items-start gap-3 rounded-xl border p-4 transition-all ${
            hasPendingChangeOrder
              ? 'border-rose-300 bg-rose-50 hover:border-rose-400 hover:shadow-md dark:border-rose-800 dark:bg-rose-950/40'
              : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/40'
          }`}
        >
          <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold ${hasPendingChangeOrder ? 'bg-rose-600' : 'bg-zinc-500'}`}>
            $
          </div>
          <div className="flex-1 min-w-0">
            <div className={`text-sm font-semibold ${hasPendingChangeOrder ? 'text-rose-900 dark:text-rose-100' : 'text-zinc-900 dark:text-zinc-100'}`}>
              Pay pending invoice
            </div>
            <div className={`text-xs mt-0.5 ${hasPendingChangeOrder ? 'text-rose-700 dark:text-rose-300' : 'text-zinc-600 dark:text-zinc-400'}`}>
              {hasPendingChangeOrder
                ? 'Existing change order awaiting payment.'
                : 'No pending invoices right now.'}
            </div>
            <div className={`text-[11px] mt-1.5 font-medium ${hasPendingChangeOrder ? 'text-rose-800 dark:text-rose-200' : 'text-zinc-700 dark:text-zinc-300'}`}>
              Open Payoneer link →
            </div>
          </div>
        </a>
      </div>
    </section>
  )
}
