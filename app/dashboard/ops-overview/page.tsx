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
  loading: boolean;
};

async function readMetric(load: () => Promise<number>): Promise<number | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

function MetricTile({ card }: { card: MetricCard }) {
  return (
    <Link
      href={card.href}
      target="_blank"
      className="dash-card group"
    >
      <div
        className="h-1.5 w-16 rounded-full"
        style={{ backgroundColor: card.accent }}
      />
      <div className="dash-label">{card.label}</div>
      <div className="dash-value">
        {card.loading ? (
          <span className="dash-loading">
            <span className="dash-spinner" />
            Loading...
          </span>
        ) : (
          card.value
        )}
      </div>
      <div className="dash-note">{card.note}</div>
      <div className="dash-link">Open CRM view</div>
    </Link>
  );
}

export default async function OpsOverviewIframePage() {
  const openTickets = await readMetric(() =>
    fetchTotalCount("serviceTickets", 'ticketStatus[neq]:"TICKET_CLOSED"'),
  );
  const criticalTickets = await readMetric(() =>
    fetchTotalCount("serviceTickets", 'priority[eq]:"PRIORITY_CRITICAL"'),
  );
  const activeEvents = await readMetric(() =>
    fetchTotalCount(
      "venueEvents",
      'or(workflowStatus[eq]:"STATUS_PENDING",workflowStatus[eq]:"STATUS_CONFIRMED")',
    ),
  );
  const wonDeals = await readMetric(() =>
    fetchTotalCount("opportunities", 'bidStatus[eq]:"WON"'),
  );
  const problemWalkthroughs = await readMetric(() =>
    fetchTotalCount("walkthroughLogs", 'result[eq]:"RESULT_PROBLEM"'),
  );
  const activeVenues = await readMetric(() =>
    fetchTotalCount("venues", 'venueStatus[eq]:"ACTIVE"'),
  );

  const cards: MetricCard[] = [
    {
      label: "Open Service Tickets",
      value: formatMetricValue(openTickets ?? 0),
      loading: openTickets == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/serviceTickets",
      accent: "#378ADD",
      note: openTickets == null ? "Retrying shortly..." : "All service tickets except closed",
    },
    {
      label: "Critical Tickets",
      value: formatMetricValue(criticalTickets ?? 0),
      loading: criticalTickets == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/serviceTickets",
      accent: "#E24B4A",
      note: criticalTickets == null ? "Retrying shortly..." : "Priority set to critical",
    },
    {
      label: "Pending / Confirmed Events",
      value: formatMetricValue(activeEvents ?? 0),
      loading: activeEvents == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/venueEvents",
      accent: "#378ADD",
      note: activeEvents == null ? "Retrying shortly..." : "Workflow status pending or confirmed",
    },
    {
      label: "Won Deals",
      value: formatMetricValue(wonDeals ?? 0),
      loading: wonDeals == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/opportunities",
      accent: "#1D9E75",
      note: wonDeals == null ? "Retrying shortly..." : "Opportunities with bid status won",
    },
    {
      label: "Problem Walkthroughs",
      value: formatMetricValue(problemWalkthroughs ?? 0),
      loading: problemWalkthroughs == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/walkthroughLogs",
      accent: "#EF9F27",
      note: problemWalkthroughs == null ? "Retrying shortly..." : "Walkthrough logs flagged as problems",
    },
    {
      label: "Active Venues",
      value: formatMetricValue(activeVenues ?? 0),
      loading: activeVenues == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/venues",
      accent: "#378ADD",
      note: activeVenues == null ? "Retrying shortly..." : "Venue status currently active",
    },
  ];

  return (
    <>
      <style>{css}</style>
      <main className="dash-main">
        <AutoRefresh everyMs={REFRESH_MS} />
        <div className="dash-head">
          <div>
            <div className="dash-overline">ANC Operations</div>
            <h1 className="dash-title">Operations Overview</h1>
          </div>
          <div className="dash-badge">Live · 5 min</div>
        </div>
        <div className="dash-grid">
          {cards.map((card) => (
            <MetricTile key={card.label} card={card} />
          ))}
        </div>
      </main>
    </>
  );
}

const css = `
  .dash-main {
    min-height: 100vh;
    background: transparent;
    color: #e6e6e6;
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    padding: 0 1.5rem 2rem;
  }

  @media (prefers-color-scheme: light) {
    .dash-main { color: #333333; }
  }

  .dash-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 0 1.25rem;
  }

  .dash-overline {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: rgba(255,255,255,0.4);
  }

  @media (prefers-color-scheme: light) {
    .dash-overline { color: rgba(0,0,0,0.4); }
  }

  .dash-title {
    margin-top: 0.25rem;
    font-size: 1.125rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .dash-badge {
    flex-shrink: 0;
    border-radius: 9999px;
    background: rgba(255,255,255,0.08);
    padding: 0.3rem 0.75rem;
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: rgba(255,255,255,0.4);
  }

  @media (prefers-color-scheme: light) {
    .dash-badge { background: rgba(0,0,0,0.06); color: rgba(0,0,0,0.4); }
  }

  .dash-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  @media (min-width: 768px) {
    .dash-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 1280px) {
    .dash-grid { grid-template-columns: repeat(3, 1fr); }
  }

  .dash-card {
    display: block;
    border-radius: 0.5rem;
    border: 1px solid rgba(255,255,255,0.06);
    background: rgba(255,255,255,0.04);
    padding: 1.125rem 1.25rem;
    text-decoration: none;
    transition: background 0.15s, border-color 0.15s;
  }

  .dash-card:hover {
    background: rgba(255,255,255,0.07);
    border-color: rgba(255,255,255,0.1);
  }

  @media (prefers-color-scheme: light) {
    .dash-card {
      border-color: rgba(0,0,0,0.06);
      background: rgba(0,0,0,0.02);
    }
    .dash-card:hover {
      background: rgba(0,0,0,0.04);
      border-color: rgba(0,0,0,0.1);
    }
  }

  .dash-label {
    font-size: 0.625rem;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    color: #999999;
  }

  @media (prefers-color-scheme: light) {
    .dash-label { color: #666666; }
  }

  .dash-value {
    margin-top: 0.625rem;
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .dash-note {
    margin-top: 0.5rem;
    font-size: 0.8125rem;
    color: #999999;
  }

  @media (prefers-color-scheme: light) {
    .dash-note { color: #666666; }
  }

  .dash-link {
    margin-top: 0.875rem;
    font-size: 0.6875rem;
    font-weight: 500;
    color: #378ADD;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .dash-card:hover .dash-link { opacity: 1; }

  .dash-loading {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9375rem;
    font-weight: 400;
    color: #999999;
  }

  @media (prefers-color-scheme: light) {
    .dash-loading { color: #666666; }
  }

  .dash-spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 1.5px solid rgba(255,255,255,0.08);
    border-top-color: #999999;
    border-radius: 50%;
    animation: dash-spin 0.8s linear infinite;
  }

  @media (prefers-color-scheme: light) {
    .dash-spinner { border-color: rgba(0,0,0,0.08); border-top-color: #666666; }
  }

  @keyframes dash-spin {
    to { transform: rotate(360deg); }
  }
`;
