import { query } from '../lib/db'

async function main() {
  await query(`
    CREATE TABLE IF NOT EXISTS budget_alert_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      budget_id text NOT NULL,
      budget_client_name text,
      threshold integer NOT NULL,
      percent_at_alert numeric(5,2) NOT NULL,
      hours_used numeric(8,2),
      hours_budgeted numeric(8,2),
      alerted_at timestamptz NOT NULL DEFAULT now(),
      slack_sent boolean DEFAULT false,
      email_sent boolean DEFAULT false,
      email_recipient text,
      UNIQUE (budget_id, threshold)
    );
    CREATE INDEX IF NOT EXISTS idx_budget_alert_log_budget ON budget_alert_log(budget_id);
  `)
  console.log('Migration complete')
  process.exit(0)
}

main().catch(console.error)
