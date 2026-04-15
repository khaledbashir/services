import Link from "next/link";

import { AutoRefresh } from "@/app/dashboard/_components/auto-refresh";
import { fetchTotalCount, formatMetricValue } from "@/lib/iframe-dashboard";

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

export default async function OpsOverviewIframePage() {
  const [
    openTickets,
    criticalTickets,
    activeEvents,
    wonDeals,
    problemWalkthroughs,
    activeVenues,
  ] = await Promise.all([
    fetchTotalCount("serviceTickets", 'ticketStatus[neq]:"TICKET_CLOSED"'),
    fetchTotalCount("serviceTickets", 'priority[eq]:"PRIORITY_CRITICAL"'),
    fetchTotalCount(
      "venueEvents",
      'or(workflowStatus[eq]:"STATUS_PENDING",workflowStatus[eq]:"STATUS_CONFIRMED")',
    ),
    fetchTotalCount("opportunities", 'bidStatus[eq]:"WON"'),
    fetchTotalCount("walkthroughLogs", 'result[eq]:"RESULT_PROBLEM"'),
    fetchTotalCount("venues", 'venueStatus[eq]:"ACTIVE"'),
  ]);

  const cards: MetricCard[] = [
    {
      label: "Open Service Tickets",
      value: formatMetricValue(openTickets),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/serviceTickets",
      accent: "#5ba2ff",
      note: "All service tickets except closed",
    },
    {
      label: "Critical Tickets",
      value: formatMetricValue(criticalTickets),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/serviceTickets",
      accent: "#ff6b7d",
      note: "Priority set to critical",
    },
    {
      label: "Pending / Confirmed Events",
      value: formatMetricValue(activeEvents),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/venueEvents",
      accent: "#7c91ff",
      note: "Workflow status pending or confirmed",
    },
    {
      label: "Won Deals",
      value: formatMetricValue(wonDeals),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/opportunities",
      accent: "#4fd1a5",
      note: "Opportunities with bid status won",
    },
    {
      label: "Problem Walkthroughs",
      value: formatMetricValue(problemWalkthroughs),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/walkthroughLogs",
      accent: "#ffb14a",
      note: "Walkthrough logs flagged as problems",
    },
    {
      label: "Active Venues",
      value: formatMetricValue(activeVenues),
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/venues",
      accent: "#37d6ff",
      note: "Venue status currently active",
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
                ANC Operations
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Operations Overview
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-[#95a3bc]">
                Live operational counts pulled straight from Twenty. This iframe
                refreshes itself every five minutes.
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

