'use client'

// Replaces the old `<meta httpEquiv="refresh" content="60" />` hard reload
// that was blowing away iframe state on this page every minute.
//
// Behavior:
//   * Polls every 60s while the tab is visible
//   * On visibilitychange → visible (tab refocus), fires an immediate refresh
//     so Ahmad/Charlie don't see stale meter values after switching back from
//     another tab
//   * Pauses for 30s after typing INSIDE the dashboard (so an input edit
//     doesn't get wiped mid-keystroke). Scrolling / focus-switching no longer
//     pause anything.
//   * Skips while the tab is hidden (no point burning CPU)
//
// Uses Next.js router.refresh() — refetches server components, keeps
// iframe/scroll/form state intact, no browser reload.

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'

const REFRESH_INTERVAL_MS = 60 * 1000          // 1 minute
const TYPING_PAUSE_MS = 30 * 1000              // 30 seconds after last keystroke

export default function AutoRefresh() {
  const router = useRouter()
  const lastTypeRef = useRef<number>(0)

  useEffect(() => {
    const bumpType = () => { lastTypeRef.current = Date.now() }
    // Only `keydown` pauses the loop — and only when typing in a form field.
    // Click/scroll/focus do NOT pause; those happen constantly and shouldn't
    // block a 60-second freshness loop.
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const tag = target.tagName
      const editable = target.isContentEditable
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || editable) {
        bumpType()
      }
    }
    window.addEventListener('keydown', onKeyDown, { passive: true })

    const tick = () => {
      if (document.hidden) return
      if (Date.now() - lastTypeRef.current < TYPING_PAUSE_MS) return
      router.refresh()
    }
    const interval = setInterval(tick, REFRESH_INTERVAL_MS)

    // Immediate refresh when the tab comes back to visible — covers the
    // "I switched back from Slack and the meter is stale" case.
    const onVisChange = () => {
      if (!document.hidden) router.refresh()
    }
    document.addEventListener('visibilitychange', onVisChange)

    return () => {
      clearInterval(interval)
      window.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('visibilitychange', onVisChange)
    }
  }, [router])

  return null
}
