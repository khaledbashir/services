const fs = require('fs');

let content = fs.readFileSync('app/hours-budgets/[id]/page.tsx', 'utf8');

content = content.replace("import { FormEvent, useEffect, useMemo, useState } from 'react'", "import { FormEvent, useEffect, useMemo, useState, useCallback } from 'react'");

content = content.replace("interface Staff { id: string; full_name: string }", `interface AlertLog {
  threshold: number
  alerted_at: string
  slack_sent: boolean
  email_sent: boolean
  percent_at_alert: number
}

interface Staff { id: string; full_name: string }`);

content = content.replace("  const [staff, setStaff] = useState<Staff[]>([])", `  const [staff, setStaff] = useState<Staff[]>([])
  const [alerts, setAlerts] = useState<AlertLog[]>([])`);

content = content.replace("  const [saving, setSaving] = useState(false)", `  const [saving, setSaving] = useState(false)
  const [simulating, setSimulating] = useState(false)`);


content = content.replace("  const fetchData = async () => {\n    try {\n      const [budgetRes, staffRes] = await Promise.all([\n        fetch(`/api/hours-budgets/${params.id}`),\n        fetch('/api/staff'),\n      ])", `  const fetchData = useCallback(async () => {
    try {
      const [budgetRes, staffRes, alertsRes] = await Promise.all([
        fetch(\`/api/hours-budgets/\${params.id}\`),
        fetch('/api/staff'),
        fetch(\`/api/hours-budgets/\${params.id}/alert-status\`)
      ])`);

content = content.replace("const staffData = await staffRes.json()", `const staffData = await staffRes.json()
      const alertsData = alertsRes.ok ? await alertsRes.json() : { alerts: [] }`);

content = content.replace("setStaff(staffData.staff || [])", `setStaff(staffData.staff || [])
      setAlerts(alertsData.alerts || [])`);

content = content.replace("    } finally {\n      setLoading(false)\n    }\n  }", `    } finally {
      setLoading(false)
    }
  }, [params.id])`);

content = content.replace("  useEffect(() => {\n    fetchData()\n  }, [params.id])", `  useEffect(() => {
    fetchData()
  }, [fetchData])`);

content = content.replace("    } finally {\n      setSaving(false)\n    }\n  }", `    } finally {
      setSaving(false)
    }
  }

  const simulateAlert = async (threshold: number) => {
    setSimulating(true)
    try {
      const res = await fetch(\`/api/hours-budgets/\${params.id}/simulate-alert?threshold=\${threshold}\`, {
        method: 'POST'
      })
      if (res.ok) {
        await fetchData()
      } else {
        alert('Failed to simulate alert')
      }
    } catch (err) {
      console.error('Simulation error:', err)
      alert('Error running simulation')
    } finally {
      setSimulating(false)
    }
  }`);

content = content.replace("<div className=\"grid gap-6 lg:grid-cols-[1.3fr,1fr]\">", `<div className="flex gap-3 justify-end items-center">
             {(process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DEV_ALERT_BUTTONS === '1') && (
                <>
                  <button onClick={() => simulateAlert(50)} disabled={simulating} className="text-xs bg-zinc-200 hover:bg-zinc-300 text-zinc-800 px-3 py-1.5 rounded transition-colors disabled:opacity-50">Simulate 50% Alert</button>
                  <button onClick={() => simulateAlert(75)} disabled={simulating} className="text-xs bg-zinc-200 hover:bg-zinc-300 text-zinc-800 px-3 py-1.5 rounded transition-colors disabled:opacity-50">Simulate 75% Alert</button>
                </>
             )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr,1fr]">`);

content = content.replace("<span>{budget.total_hours > budget.hours_spent ? `${(budget.total_hours - budget.hours_spent).toFixed(1)} hrs remaining` : 'Budget exceeded'}</span>\n                </div>\n              </div>\n\n              <div className=\"border border-zinc-200 bg-white p-6\">", `<span>{budget.total_hours > budget.hours_spent ? \`\${(budget.total_hours - budget.hours_spent).toFixed(1)} hrs remaining\` : 'Budget exceeded'}</span>
                  <span>{alerts.length > 0 ? \`Alerted at \${alerts[0].threshold}%\` : 'ON TRACK'}</span>
                </div>
              </div>

              <div className="border border-zinc-200 bg-white p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-zinc-900">Alert History</h2>
                </div>
                {alerts.length === 0 ? (
                  <div className="text-sm text-zinc-500">No alerts have been fired yet.</div>
                ) : (
                  <div className="space-y-3">
                    {alerts.map((a, i) => (
                      <div key={i} className="flex justify-between items-center text-sm border-b border-zinc-100 pb-2 last:border-0 last:pb-0">
                        <div><span className="font-medium text-zinc-800">{a.threshold}% Threshold</span> <span className="text-zinc-500 text-xs ml-2">({a.percent_at_alert || a.threshold}% actual)</span></div>
                        <div className="flex items-center gap-4 text-xs">
                           <span className="text-zinc-500">{new Date(a.alerted_at).toLocaleString()}</span>
                           <div className="flex gap-2">
                             <span title="Slack" className={\`w-2 h-2 rounded-full \${a.slack_sent ? 'bg-green-500' : 'bg-zinc-300'}\`}></span>
                             <span title="Email" className={\`w-2 h-2 rounded-full \${a.email_sent ? 'bg-green-500' : 'bg-zinc-300'}\`}></span>
                           </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="border border-zinc-200 bg-white p-6">`);

fs.writeFileSync('app/hours-budgets/[id]/page.tsx', content);

