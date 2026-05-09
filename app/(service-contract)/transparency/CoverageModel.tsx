/**
 * Three-bucket coverage model — explicit clarity for stakeholders on what
 * lives where:
 *   • Service Contract  — $1,500/mo retainer covering operating + maintaining
 *                         the four live platforms (12 hrs included).
 *   • Warranty          — 30-day re-fix-free window on everything already
 *                         shipped (platforms + recent CO deliveries).
 *   • Change Orders     — NEW work outside the four platforms, separately
 *                         quoted per scope.
 *
 * Static block — describes the contract, doesn't show live numbers (those
 * live in the CoverageStrip + meter cards above). Purpose is to remove
 * ambiguity about which bucket any given activity falls into.
 */

const PLATFORMS = [
  { name: 'Proposal Engine', detail: 'Estimator, RFP analysis, Mirror Mode, cost sheets, SOW + PDF generation, product catalog, Copilot' },
  { name: 'CRM', detail: 'Account, opportunity, dashboard, view, custom field, AI agent + Slack bot management' },
  { name: 'Services Dashboard', detail: 'Venue operations — venues, events, tickets, staff scheduling, Slack notifications, CRM sync' },
  { name: 'Operator Docs', detail: 'docs.ancsports.net + the built-in AI assistant covering all four platforms' },
]

export default function CoverageModel() {
  return (
    <section id="model" className="scroll-mt-32 rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm mb-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Three buckets — what falls where</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          Every request lands in exactly one of these three pots. Knowing which one tells you whether it ticks the meter, runs free, or needs a separate quote.
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        {/* Service Contract */}
        <div className="rounded-lg border-2 border-blue-200 dark:border-blue-800/60 bg-blue-50/50 dark:bg-blue-950/30 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wider text-blue-800 dark:text-blue-300">Service Contract</div>
            <div className="text-[10px] text-blue-700/70 dark:text-blue-400/70">Ticks the 12-hr meter</div>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed mb-2">
            Operating + maintaining the four live platforms.
          </p>
          <ul className="text-[11px] text-gray-600 dark:text-gray-400 space-y-1 leading-snug">
            <li>· Bug fixes on already-shipped functionality</li>
            <li>· Server health, restarts, monitoring</li>
            <li>· Slack bot upkeep + performance tuning</li>
            <li>· Operator support + small config tweaks</li>
            <li>· Operator Docs sync</li>
          </ul>
          <div className="text-[10px] text-blue-700 dark:text-blue-400 mt-3 pt-2 border-t border-blue-200 dark:border-blue-800/40">
            $1,500/mo · 12 hrs included · $90/hr overage
          </div>
        </div>

        {/* Warranty */}
        <div className="rounded-lg border-2 border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">Warranty</div>
            <div className="text-[10px] text-emerald-700/70 dark:text-emerald-400/70">Free during window</div>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed mb-2">
            30-day re-fix-free window on everything already shipped.
          </p>
          <ul className="text-[11px] text-gray-600 dark:text-gray-400 space-y-1 leading-snug">
            <li>· Applies to all four platforms</li>
            <li>· Applies to every shipped Change Order</li>
            <li>· Regression on the same delivery → fixed at no charge</li>
            <li>· Doesn&apos;t tick the retainer meter</li>
          </ul>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-3 pt-2 border-t border-emerald-200 dark:border-emerald-800/40">
            Auto-applied · 30 days from each ship date
          </div>
        </div>

        {/* Change Orders */}
        <div className="rounded-lg border-2 border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/30 p-4">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Change Orders</div>
            <div className="text-[10px] text-amber-700/70 dark:text-amber-400/70">Separate quote</div>
          </div>
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed mb-2">
            NEW work outside the four platforms.
          </p>
          <ul className="text-[11px] text-gray-600 dark:text-gray-400 space-y-1 leading-snug">
            <li>· New feature, module, integration</li>
            <li>· New dashboard, report, automation</li>
            <li>· Migration / data lift</li>
            <li>· One number, one delivery, one invoice per scope</li>
          </ul>
          <div className="text-[10px] text-amber-700 dark:text-amber-400 mt-3 pt-2 border-t border-amber-200 dark:border-amber-800/40">
            Fixed-price quote per scope · 14-day validity
          </div>
        </div>
      </div>

      {/* The four platforms */}
      <div className="mt-5 pt-5 border-t border-gray-100 dark:border-gray-800">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400 mb-3">
          Under the contract — the four live platforms
        </div>
        <div className="grid md:grid-cols-2 gap-2">
          {PLATFORMS.map((p) => (
            <div key={p.name} className="flex gap-2.5 py-1.5">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-gray-900 dark:text-gray-100">{p.name}</div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">{p.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
