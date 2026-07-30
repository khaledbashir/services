'use client'

import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'

function clampPanelWidth(width: number, minWidth: number, maxWidth: number): number {
  const viewportMax = typeof window === 'undefined'
    ? maxWidth
    : Math.min(maxWidth, window.innerWidth * 0.95)
  return Math.max(minWidth, Math.min(width, viewportMax))
}

export function ResizableSidePanel({
  open,
  onClose,
  preferenceKey,
  preferencesEndpoint = '/api/preferences',
  ariaLabel,
  children,
  defaultWidth = 760,
  minWidth = 380,
  maxWidth = 1200,
  panelClassName = 'bg-zinc-50',
}: {
  open: boolean
  onClose: () => void
  preferenceKey: string
  preferencesEndpoint?: string
  ariaLabel: string
  children: ReactNode
  defaultWidth?: number
  minWidth?: number
  maxWidth?: number
  panelClassName?: string
}) {
  const [width, setWidth] = useState(defaultWidth)
  const resizingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    const loadWidth = async () => {
      try {
        const response = await fetch(`${preferencesEndpoint}?key=${encodeURIComponent(preferenceKey)}`)
        if (!response.ok) throw new Error(`Preference request failed (${response.status})`)
        const data = await response.json()
        if (!data?.value || cancelled) return
        const stored = Number(JSON.parse(data.value)?.width)
        if (Number.isFinite(stored)) {
          setWidth(clampPanelWidth(stored, minWidth, maxWidth))
        }
      } catch (error) {
        console.error(`Failed to load side-panel preference ${preferenceKey}:`, error)
      }
    }
    void loadWidth()
    return () => { cancelled = true }
  }, [maxWidth, minWidth, preferenceKey, preferencesEndpoint])

  useEffect(() => {
    if (!open) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose, open])

  const persistWidth = async (nextWidth: number) => {
    try {
      const response = await fetch(preferencesEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: preferenceKey,
          value: JSON.stringify({ width: Math.round(nextWidth) }),
        }),
      })
      if (!response.ok) throw new Error(`Preference request failed (${response.status})`)
    } catch (error) {
      console.error(`Failed to save side-panel preference ${preferenceKey}:`, error)
    }
  }

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault()
    resizingRef.current = true
    document.body.style.userSelect = 'none'
    document.body.style.cursor = 'col-resize'

    const move = (mouseEvent: MouseEvent) => {
      if (!resizingRef.current) return
      setWidth(clampPanelWidth(window.innerWidth - mouseEvent.clientX, minWidth, maxWidth))
    }
    const stop = () => {
      resizingRef.current = false
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', stop)
      setWidth((current) => {
        void persistWidth(current)
        return current
      })
    }

    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', stop)
  }

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-zinc-900/20 lg:bg-transparent lg:pointer-events-none"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        style={{ width }}
        className={`fixed inset-y-0 right-0 z-50 max-w-[95vw] overflow-y-auto shadow-2xl ring-1 ring-zinc-200 ${panelClassName}`}
        role="dialog"
        aria-label={ariaLabel}
      >
        <div
          onMouseDown={startResize}
          className="absolute inset-y-0 left-0 z-20 w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent hover:bg-[#0A52EF]/40 active:bg-[#0A52EF]/60"
          title="Drag to resize"
        />
        {children}
      </aside>
    </>
  )
}
