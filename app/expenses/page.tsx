import { Suspense } from 'react'
import ExpensesClient from './ExpensesClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function ExpensesPage() {
  return (
    <Suspense fallback={null}>
      <ExpensesClient />
    </Suspense>
  )
}
