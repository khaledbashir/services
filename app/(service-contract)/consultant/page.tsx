import { Suspense } from 'react'
import ConsultantClient from './ConsultantClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default function ConsultantPage() {
  return (
    <Suspense fallback={null}>
      <ConsultantClient />
    </Suspense>
  )
}
