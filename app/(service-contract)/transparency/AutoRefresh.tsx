'use client'

// Replaces the old `<meta httpEquiv="refresh" content="60" />` hard reload
// that was blowing away iframe state on this page every minute (Ahmad
// 5/13 — working in an embedded surface meant the page nuked the inner
// state every 60s).
//
// New behavior:
//   * 5-minute interval (was 1 minute)
//   * Uses Next.js router.refresh() — refetches server components, keeps
//     iframe/scroll/form state intact, no browser reload
//   * Pauses while the tab is hidden
//   * Pauses for 2 minutes after any user interaction (typing, scrolling,
//     clicking) so it never fires while Ahmad is mid-action

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const REFRESH_INTERVAL_MS = 5 * 60 * 1000     // 5 minutes
const INTERACTION_PAUSE_MS = 2 * 60 * 1000    // pause 2 min after last interaction

export default function AutoRefresh() {
  const router = useRouter()
  const lastInteractionRef = useRef<number>(Date.now())

  useEffect(() => {
    const bumpInteraction = () => { lastInteractionRef.current = Date.now() }
    const events: Array<keyof WindowEventMap> = ['keydown', 'mousedown', 'touchstart', 'scroll', 'focus']
    for (const e of events) window.addEventListener(e, bumpInteraction, { passive: true })

    const tick = () => {
      if (document.hidden) return
      if (Date.now() - lastInteractionRef.current < INTERACTION_PAUSE_MS) return
      router.refresh()
    }
    const interval = setInterval(tick, REFRESH_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      for (const e of events) window.removeEventListener(e, bumpInteraction)
    }
  }, [router])

  return null
}
