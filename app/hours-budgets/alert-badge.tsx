'use client'

import { useEffect, useState } from 'react'

export function AlertBadge({ budgetId, progress }: { budgetId: string, progress: number }) {
  const [alert, setAlert] = useState<number | null>(null)

  useEffect(() => {
    // Only check if it could potentially have an alert
    if (progress < 0.5) return
    
    fetch(`/api/hours-budgets/${budgetId}/alert-status`)
      .then(r => r.json())
      .then(d => {
        if (d.alerts && d.alerts.length > 0) {
          // It's ordered by threshold DESC
          setAlert(d.alerts[0].threshold)
        }
      })
      .catch(console.error)
  }, [budgetId, progress])

  if (!alert) return null

  return (
    <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide ${alert === 75 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}>
      {alert}% alerted
    </span>
  )
}
