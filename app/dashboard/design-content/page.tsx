import Link from "next/link";

import { AutoRefresh } from "@/app/dashboard/_components/auto-refresh";
import {
  fetchSumForCurrentMonth,
  fetchTotalCount,
  formatMetricValue,
  getCurrentMonthLabel,
} from "@/lib/iframe-dashboard";

export const dynamic = "force-dynamic";

const REFRESH_MS = 5 * 60 * 1000;

type MetricCard = {
  label: string;
  value: string;
  href: string;
  accent: string;
  note: string;
};

function MetricTile({ card }: { card: MetricCard }) {
  return (
    <Link
      href={card.href}
      target="_blank"
      className="group rounded-2xl border border-white/10 bg-[#141c2b] p-5 transition hover:border-white/20 hover:bg-[#182235]"
    >
      <div
        className="h-1.5 w-16 rounded-full"
        style={{ backgroundColor: card.accent }}
      />
      <div className="mt-5 text-xs uppercase tracking-[0.22em] text-[#7f8ca6]">
        {card.label}
      </div>
      <div className="mt-3 text-4xl font-semibold tracking-tight text-white">
        {card.value}
      </div>
      <div className="mt-3 text-sm text-[#9ba8c0]">{card.note}</div>
      <div className="mt-5 text-xs font-medium text-[#71a7ff] opacity-80 transition group-hover:opacity-100">
        Open CRM view
      </div>
    </Link>
  );
}

export default async function DesignContentIframePage() {
  const [openDesignRequests, contentInQueue, printInProduction, budgetAlerts, designerHours] =
    await Promise.all([
      fetchTotalCount(
        "designRequests",
        'and(status[neq]:"STATUS_DONE",status[neq]:"STATUS_APPROVED")',
      ),
      fetchTotalCount("contentSchedules", 'status[eq]:"STATUS_IN_QUEUE"'),
      fetchTotalCount("printRequests", 'status[eq]:"STATUS_IN_PRODUCTION"'),
      fetchTotalCount("designerHoursBudgets", 'alert75Pct[eq]:true'),
      fetchSumForCurrentMonth("designerTimeEntries", "hoursSpent", "date"),
    ]);

  const monthLabel = getCurrentMonthLabel();

  const cards: MetricCard[] = [
    {
      label: "Open Design Requests",
      value: formatMetricValue(openDesignRequests),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/designRequests",
      accent: "#71a7ff",
      note: "All design requests except done and approved",
    },
    {
      label: "Content In Queue",
      value: formatMetricValue(contentInQueue),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/contentSchedules",
      accent: "#8b7dff",
      note: "Content schedules currently waiting in queue",
    },
    {
      label: "Print In Production",
      value: formatMetricValue(printInProduction),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/printRequests",
      accent: "#4fd1a5",
      note: "Print requests actively in production",
    },
    {
      label: "Budget Alerts",
      value: formatMetricValue(budgetAlerts),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/designerHoursBudgets",
      accent: "#ff8e5a",
      note: "Designer budget rows over the 75% alert threshold",
    },
    {
      label: "Designer Hours This Month",
      value: formatMetricValue(designerHours, { decimals: 2 }),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/designerTimeEntries",
      accent: "#37d6ff",
      note: `${monthLabel} total from designer time entries`,
    },
  ];

  return (
    <main className="min-h-screen bg-[#0b1220] text-white">
      <AutoRefresh everyMs={REFRESH_MS} />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="rounded-[28px] border border-white/10 bg-[#101827] px-6 py-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-4 border-b border-white/8 pb-6 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs uppercase tracking-[0.28em] text-[#6e7c96]">
                ANC Creative Ops
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Design &amp; Content
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#95a3bc]">
                Live creative production metrics rendered outside Twenty&apos;s
                native widget stack and refreshed every five minutes.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.22em] text-[#8ea0bf]">
              Live refresh · 5 min
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {cards.map((card) => (
              <MetricTile key={card.label} card={card} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
