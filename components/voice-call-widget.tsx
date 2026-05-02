'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type Turn = {
  id: string
  role: 'user' | 'assistant'
  text: string
  toolActions?: Array<{ name: string; args: string; result: string }>
}

type RecState = 'idle' | 'listening' | 'thinking' | 'speaking'

interface SpeechRecognitionEventLike {
  resultIndex: number
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>
}

export interface VoiceCallWidgetProps {
  /** Agent id or slug. Used to call /api/voice-agents/{ref}/turn|tts. */
  agentRef: string
  /** Agent name for the header. */
  agentName?: string
  /** Optional spoken greeting played on first interaction. */
  greeting?: string | null
  /** Compact mode for embed iframe — drops the header and shrinks padding. */
  compact?: boolean
  /** Show the typed-text fallback input (default true). */
  showTextFallback?: boolean
}

export function VoiceCallWidget({
  agentRef,
  agentName,
  greeting,
  compact = false,
  showTextFallback = true,
}: VoiceCallWidgetProps) {
  const [supported, setSupported] = useState<boolean | null>(null)
  const [recState, setRecState] = useState<RecState>('idle')
  const [interim, setInterim] = useState('')
  const [chatId, setChatId] = useState<string | null>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [error, setError] = useState<string | null>(null)
  const recogRef = useRef<unknown>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const finalTranscriptRef = useRef('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    setSupported(!!(w.SpeechRecognition || w.webkitSpeechRecognition))
  }, [])

  const playTts = useCallback(async (text: string) => {
    setRecState('speaking')
    const ttsRes = await fetch(`/api/voice-agents/${encodeURIComponent(agentRef)}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!ttsRes.ok) {
      const errBody = await ttsRes.json().catch(() => ({}))
      throw new Error((errBody as { error?: string }).error || `tts failed (${ttsRes.status})`)
    }
    const blob = await ttsRes.blob()
    const url = URL.createObjectURL(blob)
    if (audioRef.current) {
      audioRef.current.src = url
      await audioRef.current.play().catch(err => {
        console.error('audio play blocked:', err)
      })
    }
  }, [agentRef])

  const sendTurn = useCallback(async (text: string) => {
    setRecState('thinking')
    setError(null)
    const userTurn: Turn = { id: `u-${Date.now()}`, role: 'user', text }
    setTurns(prev => [...prev, userTurn])

    try {
      const res = await fetch(`/api/voice-agents/${encodeURIComponent(agentRef)}/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, chat_id: chatId || undefined }),
      })
      const data = (await res.json()) as {
        ok: boolean
        chatId?: string
        text?: string
        toolActions?: Array<{ name: string; args: string; result: string }>
        error?: string
      }
      if (!res.ok || !data.ok) throw new Error(data.error || `turn failed (${res.status})`)
      if (data.chatId && !chatId) setChatId(data.chatId)
      const replyText = data.text || ''
      setTurns(prev => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'assistant', text: replyText, toolActions: data.toolActions || [] },
      ])
      if (replyText) await playTts(replyText)
      else setRecState('idle')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setRecState('idle')
    }
  }, [agentRef, chatId, playTts])

  const startListening = useCallback(async () => {
    if (typeof window === 'undefined') return
    const w = window as unknown as {
      SpeechRecognition?: new () => unknown
      webkitSpeechRecognition?: new () => unknown
    }
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) {
      setError('Speech recognition not supported in this browser. Chrome, Edge, or Safari recommended.')
      return
    }

    // First interaction: play the greeting before listening, if any.
    if (turns.length === 0 && greeting?.trim()) {
      try {
        await playTts(greeting.trim())
      } catch (err) {
        console.error('greeting playback failed:', err)
      }
    }

    finalTranscriptRef.current = ''
    setInterim('')
    setError(null)
    const recog = new (Ctor as new () => {
      lang: string
      continuous: boolean
      interimResults: boolean
      start: () => void
      stop: () => void
      onresult: ((e: SpeechRecognitionEventLike) => void) | null
      onerror: ((e: { error: string }) => void) | null
      onend: (() => void) | null
    })()
    recog.lang = 'en-US'
    recog.continuous = true
    recog.interimResults = true
    recog.onresult = (event) => {
      let interimText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0].transcript
        if (result.isFinal) finalTranscriptRef.current += transcript
        else interimText += transcript
      }
      setInterim(interimText)
    }
    recog.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      setError(`mic error: ${e.error}`)
      setRecState('idle')
    }
    recog.onend = () => {
      const finalText = (finalTranscriptRef.current + ' ' + interim).trim()
      setInterim('')
      if (recState === 'listening') {
        if (finalText.length > 0) sendTurn(finalText)
        else setRecState('idle')
      }
    }
    recogRef.current = recog
    setRecState('listening')
    recog.start()
  }, [greeting, interim, recState, sendTurn, turns.length, playTts])

  const stopListening = useCallback(() => {
    const recog = recogRef.current as { stop: () => void } | null
    if (recog) recog.stop()
  }, [])

  const handleAudioEnded = () => {
    if (recState === 'speaking') setRecState('idle')
  }

  const newConversation = () => {
    setChatId(null)
    setTurns([])
    setInterim('')
    setError(null)
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.removeAttribute('src')
    }
    setRecState('idle')
  }

  const sendTyped = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    sendTurn(trimmed)
  }

  const containerClass = compact ? 'p-3' : 'p-5'

  return (
    <div className={`flex h-full min-h-[460px] flex-col ${containerClass}`}>
      {!compact && (
        <header className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-500">
              Voice agent
            </p>
            <h2 className="mt-1 text-xl font-black text-zinc-950 dark:text-zinc-100">
              {agentName || 'ANC Voice'}
            </h2>
          </div>
          <button
            type="button"
            onClick={newConversation}
            className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            New conversation
          </button>
        </header>
      )}

      {supported === false && (
        <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          This browser does not support Web Speech recognition. Use Chrome, Edge, or Safari (desktop). Typing still works below.
        </div>
      )}

      <section className="flex-1 space-y-3 overflow-y-auto rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {turns.length === 0 && (
          <p className="text-sm text-zinc-500">
            Tap the mic and speak. The agent has access to your dashboard and will act on what you say.
          </p>
        )}
        {turns.map((turn) => (
          <div key={turn.id} className={turn.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
            <div
              className={
                turn.role === 'user'
                  ? 'max-w-[82%] rounded-lg bg-[#0A52EF] px-4 py-2 text-sm font-medium text-white'
                  : 'max-w-[82%] rounded-lg bg-zinc-100 px-4 py-2 text-sm text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
              }
            >
              <p className="whitespace-pre-wrap">{turn.text}</p>
              {turn.toolActions && turn.toolActions.length > 0 && (
                <details className="mt-2 text-xs opacity-70">
                  <summary className="cursor-pointer">
                    {turn.toolActions.length} tool{turn.toolActions.length === 1 ? '' : 's'} used
                  </summary>
                  <ul className="mt-1 space-y-1">
                    {turn.toolActions.map((a, i) => (
                      <li key={i} className="font-mono text-[11px]">
                        <span className="font-semibold">{a.name}</span>
                        {a.args ? ` · ${a.args.slice(0, 80)}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </div>
        ))}
        {recState === 'listening' && (
          <div className="flex justify-end">
            <div className="max-w-[82%] rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-2 text-sm italic text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400">
              {interim || 'Listening…'}
            </div>
          </div>
        )}
        {recState === 'thinking' && (
          <div className="flex justify-start">
            <div className="max-w-[82%] rounded-lg bg-zinc-100 px-4 py-2 text-sm text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              Thinking…
            </div>
          </div>
        )}
      </section>

      {error && (
        <div className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-xs text-rose-800">
          {error}
        </div>
      )}

      <div className="mt-5 flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={recState === 'listening' ? stopListening : startListening}
          disabled={recState === 'thinking' || recState === 'speaking'}
          className={[
            'flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition',
            recState === 'listening' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#0A52EF] hover:bg-[#0840C0]',
            recState === 'thinking' || recState === 'speaking' ? 'cursor-not-allowed opacity-60' : '',
          ].join(' ')}
          aria-label={recState === 'listening' ? 'Stop listening' : 'Start listening'}
        >
          {recState === 'listening' ? (
            <svg viewBox="0 0 24 24" className="h-8 w-8" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-9 w-9" fill="currentColor"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2Z" /></svg>
          )}
        </button>
        <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">
          {recState === 'idle' && 'Tap to talk'}
          {recState === 'listening' && 'Listening — tap to stop'}
          {recState === 'thinking' && 'Working…'}
          {recState === 'speaking' && 'Speaking…'}
        </p>
      </div>

      {showTextFallback && <TextFallback onSend={sendTyped} disabled={recState === 'thinking' || recState === 'speaking'} />}

      <audio
        ref={audioRef}
        onEnded={handleAudioEnded}
        onError={() => setRecState('idle')}
        className="hidden"
      />
    </div>
  )
}

function TextFallback({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim()) return
        onSend(value)
        setValue('')
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Or type instead…"
        className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        Send
      </button>
    </form>
  )
}
