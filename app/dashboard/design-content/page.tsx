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

export default async function DesignContentIframePage() {
  const openDesignRequests = await readMetric(() =>
    fetchTotalCount(
      "designRequests",
      'and(status[neq]:"STATUS_DONE",status[neq]:"STATUS_APPROVED")',
    ),
  );
  const contentInQueue = await readMetric(() =>
    fetchTotalCount("contentSchedules", 'status[eq]:"STATUS_IN_QUEUE"'),
  );
  const printInProduction = await readMetric(() =>
    fetchTotalCount("printRequests", 'status[eq]:"STATUS_IN_PRODUCTION"'),
  );
  const budgetAlerts = await readMetric(() =>
    fetchTotalCount("designerHoursBudgets", 'alert75Pct[eq]:true'),
  );
  const designerHours = await readMetric(() =>
    fetchSumForCurrentMonth("designerTimeEntries", "hoursSpent", "date"),
  );

  const monthLabel = getCurrentMonthLabel();

  const cards: MetricCard[] = [
    {
      label: "Open Design Requests",
      value: formatMetricValue(openDesignRequests ?? 0),
      loading: openDesignRequests == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/designRequests",
      accent: "#378ADD",
      note: openDesignRequests == null ? "Retrying shortly..." : "All design requests except done and approved",
    },
    {
      label: "Content In Queue",
      value: formatMetricValue(contentInQueue ?? 0),
      loading: contentInQueue == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/contentSchedules",
      accent: "#EF9F27",
      note: contentInQueue == null ? "Retrying shortly..." : "Content schedules currently waiting in queue",
    },
    {
      label: "Print In Production",
      value: formatMetricValue(printInProduction ?? 0),
      loading: printInProduction == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/printRequests",
      accent: "#1D9E75",
      note: printInProduction == null ? "Retrying shortly..." : "Print requests actively in production",
    },
    {
      label: "Budget Alerts",
      value: formatMetricValue(budgetAlerts ?? 0),
      loading: budgetAlerts == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/designerHoursBudgets",
      accent: "#E24B4A",
      note: budgetAlerts == null ? "Retrying shortly..." : "Designer budget rows over the 75% alert threshold",
    },
    {
      label: "Designer Hours This Month",
      value: formatMetricValue(designerHours ?? 0, { decimals: 2 }),
      loading: designerHours == null,
      href: "https://abc-twenty.izcgmb.easypanel.host/objects/designerTimeEntries",
      accent: "#378ADD",
      note: designerHours == null ? "Retrying shortly..." : `${monthLabel} total from designer time entries`,
    },
  ];

  return (
    <>
      <style>{css}</style>
      <main className="dash-main">
        <AutoRefresh everyMs={REFRESH_MS} />
        <div className="dash-shell">
          <div className="dash-header">
            <div>
              <div className="dash-overline">ANC Creative Ops</div>
              <h1 className="dash-title">Design &amp; Content</h1>
              <p className="dash-desc">
                Live creative production metrics rendered outside Twenty&apos;s
                native widget stack and refreshed every five minutes.
              </p>
            </div>
            <div className="dash-badge">Live refresh · 5 min</div>
          </div>

          <div className="dash-grid">
            {cards.map((card) => (
              <MetricTile key={card.label} card={card} />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

  :root {
    --dash-bg: transparent;
    --dash-card-bg: #1e1e1e;
    --dash-card-border: rgba(255,255,255,0.08);
    --dash-card-hover-bg: #252525;
    --dash-card-hover-border: rgba(255,255,255,0.14);
    --dash-text-primary: #e6e6e6;
    --dash-text-secondary: #999999;
    --dash-overline-color: #777777;
    --dash-link-color: #378ADD;
    --dash-shell-bg: #1e1e1e;
    --dash-shell-border: rgba(255,255,255,0.08);
    --dash-header-border: rgba(255,255,255,0.06);
    --dash-badge-bg: rgba(255,255,255,0.05);
    --dash-badge-border: rgba(255,255,255,0.08);
    --dash-badge-color: #999999;
  }

  @media (prefers-color-scheme: light) {
    :root {
      --dash-bg: transparent;
      --dash-card-bg: #ffffff;
      --dash-card-border: rgba(0,0,0,0.08);
      --dash-card-hover-bg: #f8f8f8;
      --dash-card-hover-border: rgba(0,0,0,0.14);
      --dash-text-primary: #333333;
      --dash-text-secondary: #666666;
      --dash-overline-color: #999999;
      --dash-link-color: #378ADD;
      --dash-shell-bg: #ffffff;
      --dash-shell-border: rgba(0,0,0,0.08);
      --dash-header-border: rgba(0,0,0,0.06);
      --dash-badge-bg: rgba(0,0,0,0.04);
      --dash-badge-border: rgba(0,0,0,0.08);
      --dash-badge-color: #666666;
    }
  }

  .dash-main {
    min-height: 100vh;
    background: var(--dash-bg);
    color: var(--dash-text-primary);
    font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .dash-shell {
    max-width: 80rem;
    margin: 0 auto;
    padding: 2rem 1.5rem;
  }

  .dash-header {
    background: var(--dash-shell-bg);
    border: 1px solid var(--dash-shell-border);
    border-radius: 1rem;
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    border-bottom: 1px solid var(--dash-header-border);
    margin-bottom: 1.5rem;
  }

  @media (min-width: 768px) {
    .dash-header {
      flex-direction: row;
      align-items: flex-end;
      justify-content: space-between;
    }
  }

  .dash-overline {
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--dash-overline-color);
  }

  .dash-title {
    margin-top: 0.75rem;
    font-size: 1.75rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--dash-text-primary);
  }

  .dash-desc {
    margin-top: 0.5rem;
    max-width: 40rem;
    font-size: 0.875rem;
    color: var(--dash-text-secondary);
  }

  .dash-badge {
    flex-shrink: 0;
    border-radius: 9999px;
    border: 1px solid var(--dash-badge-border);
    background: var(--dash-badge-bg);
    padding: 0.5rem 1rem;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--dash-badge-color);
  }

  .dash-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  @media (min-width: 768px) {
    .dash-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 1280px) {
    .dash-grid { grid-template-columns: repeat(3, 1fr); }
  }

  .dash-card {
    display: block;
    border-radius: 0.75rem;
    border: 1px solid var(--dash-card-border);
    background: var(--dash-card-bg);
    padding: 1.25rem;
    text-decoration: none;
    transition: background 0.15s, border-color 0.15s;
  }

  .dash-card:hover {
    background: var(--dash-card-hover-bg);
    border-color: var(--dash-card-hover-border);
  }

  .dash-label {
    margin-top: 1.25rem;
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: var(--dash-text-secondary);
  }

  .dash-value {
    margin-top: 0.75rem;
    font-size: 2.25rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--dash-text-primary);
  }

  .dash-note {
    margin-top: 0.75rem;
    font-size: 0.875rem;
    color: var(--dash-text-secondary);
  }

  .dash-link {
    margin-top: 1.25rem;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--dash-link-color);
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .dash-card:hover .dash-link { opacity: 1; }

  .dash-loading {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1rem;
    font-weight: 400;
    color: var(--dash-text-secondary);
  }

  .dash-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--dash-card-border);
    border-top-color: var(--dash-text-secondary);
    border-radius: 50%;
    animation: dash-spin 0.8s linear infinite;
  }

  @keyframes dash-spin {
    to { transform: rotate(360deg); }
  }
`;
