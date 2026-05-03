'use client'

import { useEffect, useRef, useState } from 'react'

// Browser-native voice dictation. Wraps SpeechRecognition so any field can
// add a mic button and append speech-to-text. Falls back silently when the
// browser doesn't support it (older Firefox, in-app webviews) — components
// just don't render the mic.
export function useDictation() {
  const [dictating, setDictating] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)
  const recRef = useRef<any>(null)
  const targetRef = useRef<{ id: string; append: (text: string) => void } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) return
    setSupported(true)
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = false
    rec.lang = 'en-US'
    rec.onresult = (e: any) => {
      let chunk = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) chunk += e.results[i][0].transcript + ' '
      }
      const text = chunk.trim()
      if (!text) return
      targetRef.current?.append(text)
    }
    const reset = () => {
      setDictating(null)
      targetRef.current = null
    }
    rec.onend = reset
    rec.onerror = reset
    recRef.current = rec
    return () => { try { rec.stop() } catch {} }
  }, [])

  const toggle = (id: string, append: (text: string) => void) => {
    const rec = recRef.current
    if (!rec) return
    if (dictating === id) {
      try { rec.stop() } catch {}
      return
    }
    if (dictating) {
      try { rec.stop() } catch {}
    }
    targetRef.current = { id, append }
    setDictating(id)
    try { rec.start() } catch {
      setDictating(null)
      targetRef.current = null
    }
  }

  const stop = () => {
    if (recRef.current && dictating) {
      try { recRef.current.stop() } catch {}
    }
  }

  return { dictating, supported, toggle, stop }
}

interface MicChipProps {
  id: string
  dictation: ReturnType<typeof useDictation>
  append: (text: string) => void
  label?: string
}

export function MicChip({ id, dictation, append, label = 'Speak' }: MicChipProps) {
  if (!dictation.supported) return null
  const active = dictation.dictating === id
  return (
    <button
      type="button"
      onClick={() => dictation.toggle(id, append)}
      aria-label={active ? 'Stop dictation' : `Dictate ${label.toLowerCase()}`}
      className={`flex items-center gap-1.5 text-[11px] font-semibold px-2 py-1 rounded-full transition-colors ${
        active
          ? 'bg-red-50 text-red-600 ring-2 ring-red-300 animate-pulse'
          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
      }`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-14 0M12 18v3m-4 0h8M12 14a3 3 0 003-3V6a3 3 0 10-6 0v5a3 3 0 003 3z" />
      </svg>
      {active ? 'Listening… tap to stop' : label}
    </button>
  )
}
