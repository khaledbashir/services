'use client'

import { useEffect } from 'react'

declare global {
  interface Window {
    umami?: {
      identify: (data: Record<string, unknown>) => void
    }
  }
}

function pushIdentity() {
  if (typeof window === 'undefined') return
  const userId = localStorage.getItem('userId')
  if (!userId) return

  const payload = {
    id: userId,
    name: localStorage.getItem('userName') || '',
    role: localStorage.getItem('userRole') || '',
  }

  if (window.umami?.identify) {
    window.umami.identify(payload)
    return
  }

  let tries = 0
  const interval = setInterval(() => {
    tries += 1
    if (window.umami?.identify) {
      window.umami.identify(payload)
      clearInterval(interval)
    } else if (tries > 40) {
      clearInterval(interval)
    }
  }, 250)
}

export function UmamiIdentify() {
  useEffect(() => {
    pushIdentity()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'userId' || e.key === 'userName' || e.key === 'userRole') {
        pushIdentity()
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return null
}
