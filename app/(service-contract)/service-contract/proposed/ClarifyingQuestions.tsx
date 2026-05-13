'use client'

import { useState } from 'react'

interface Props {
  questions: string[]
  onSubmit: (answers: string[]) => void
  onSkip: () => void
  busy?: boolean
}

export default function ClarifyingQuestions({ questions, onSubmit, onSkip, busy }: Props) {
  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ''))
  const [activeIdx, setActiveIdx] = useState(0)

  if (questions.length === 0) return null

  const answeredCount = answers.filter(a => a.trim().length > 0).length

  const update = (idx: number, val: string) => {
    setAnswers(prev => {
      const next = [...prev]
      next[idx] = val
      return next
    })
  }

  const next = () => {
    if (activeIdx < questions.length - 1) setActiveIdx(activeIdx + 1)
  }
  const prev = () => {
    if (activeIdx > 0) setActiveIdx(activeIdx - 1)
  }

  return (
    <div className="rounded-2xl border-2 border-indigo-200 dark:border-indigo-800/60 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/20 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="text-2xl">🧠</div>
          <div>
            <h3 className="text-base font-semibold text-indigo-900 dark:text-indigo-100">A few quick questions first</h3>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              Surfaced from the idea — answer what you can and skip the rest. Better answers → tighter quote and plan.
            </p>
          </div>
        </div>
        <div className="text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold tabular-nums">
          {answeredCount}/{questions.length} answered
        </div>
      </div>

      {/* Question stepper */}
      <div className="flex items-center gap-1 mb-4">
        {questions.map((_, i) => (
          <button
            key={i}
            onClick={() => setActiveIdx(i)}
            className={`flex-1 h-1.5 rounded-full transition-all ${
              i === activeIdx
                ? 'bg-indigo-500'
                : answers[i].trim()
                  ? 'bg-emerald-400'
                  : 'bg-indigo-100 dark:bg-indigo-900/40'
            }`}
            aria-label={`Question ${i + 1}`}
          />
        ))}
      </div>

      {/* Active question */}
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-widest font-bold text-indigo-700 dark:text-indigo-300 mb-1.5">
          Question {activeIdx + 1} of {questions.length}
        </div>
        <label className="block text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
          {questions[activeIdx]}
        </label>
        <input
          type="text"
          value={answers[activeIdx]}
          onChange={(e) => update(activeIdx, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (activeIdx < questions.length - 1) next()
              else onSubmit(answers)
            }
          }}
          autoFocus
          disabled={busy}
          placeholder="Type or skip with the arrow →"
          className="w-full px-3 py-2 border border-indigo-200 dark:border-indigo-800/60 bg-white dark:bg-gray-900 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-60"
        />
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <button
          onClick={onSkip}
          disabled={busy}
          className="text-xs text-gray-500 hover:text-gray-900 dark:hover:text-gray-200 underline disabled:opacity-50"
        >
          Skip all → just generate
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={prev}
            disabled={busy || activeIdx === 0}
            className="px-3 py-1.5 text-xs border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 rounded-md disabled:opacity-40"
          >
            ← Back
          </button>
          {activeIdx < questions.length - 1 ? (
            <button
              onClick={next}
              disabled={busy}
              className="px-3 py-1.5 text-xs bg-indigo-500 text-white rounded-md hover:bg-indigo-600 disabled:opacity-40"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={() => onSubmit(answers)}
              disabled={busy}
              className="px-4 py-1.5 text-sm bg-[#0A52EF] text-white rounded-md hover:bg-[#0840C0] disabled:opacity-50 font-semibold"
            >
              {busy ? 'Generating…' : 'Generate scope →'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
