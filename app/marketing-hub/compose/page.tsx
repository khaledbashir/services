'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Legacy route — redirects to agent studio */
export default function MarketingComposeRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/marketing-hub/studio')
  }, [router])
  return null
}
