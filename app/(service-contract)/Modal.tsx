'use client'

import { useEffect, useState } from 'react'

interface BaseProps {
  open: boolean
  onClose: () => void
}

interface ConfirmProps extends BaseProps {
  title: string
  body: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'destructive' | 'success'
  onConfirm: () => void
}

interface PromptProps extends BaseProps {
  title: string
  body?: string
  placeholder?: string
  initialValue?: string
  confirmLabel?: string
  cancelLabel?: string
  required?: boolean
  onSubmit: (value: string) => void
}

const TONE_BTN: Record<string, string> = {
  primary:     'bg-[#0A52EF] hover:bg-[#0840C0] text-white',
  destructive: 'bg-rose-600 hover:bg-rose-700 text-white',
  success:     'bg-emerald-600 hover:bg-emerald-700 text-white',
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
      >
        {children}
      </div>
    </div>
  )
}

export function ConfirmModal({
  open, onClose, title, body, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  tone = 'primary', onConfirm,
}: ConfirmProps) {
  if (!open) return null
  const btn = TONE_BTN[tone] || TONE_BTN.primary
  return (
    <Backdrop onClose={onClose}>
      <div className="p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{body}</p>
      </div>
      <div className="flex gap-2 px-5 pb-5">
        <button
          onClick={onClose}
          className="flex-1 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {cancelLabel}
        </button>
        <button
          onClick={() => { onConfirm(); onClose() }}
          className={`flex-1 px-3 py-2 text-sm font-semibold rounded-md ${btn}`}
        >
          {confirmLabel}
        </button>
      </div>
    </Backdrop>
  )
}

export function PromptModal({
  open, onClose, title, body, placeholder, initialValue = '',
  confirmLabel = 'OK', cancelLabel = 'Cancel', required = false, onSubmit,
}: PromptProps) {
  const [value, setValue] = useState(initialValue)
  useEffect(() => { if (open) setValue(initialValue) }, [open, initialValue])
  if (!open) return null
  const submit = () => {
    if (required && !value.trim()) return
    onSubmit(value)
    onClose()
  }
  return (
    <Backdrop onClose={onClose}>
      <div className="p-5">
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
        {body && <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">{body}</p>}
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30"
        />
      </div>
      <div className="flex gap-2 px-5 pb-5">
        <button
          onClick={onClose}
          className="flex-1 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          {cancelLabel}
        </button>
        <button
          onClick={submit}
          disabled={required && !value.trim()}
          className={`flex-1 px-3 py-2 text-sm font-semibold rounded-md ${TONE_BTN.primary} disabled:opacity-50`}
        >
          {confirmLabel}
        </button>
      </div>
    </Backdrop>
  )
}

interface SuccessToastProps {
  open: boolean
  onClose: () => void
  title: string
  body?: string
  actionLabel?: string
  onAction?: () => void
}

/**
 * Success modal that replaces the post-promote `confirm()` dialog. Shows a
 * checkmark + a primary action button (e.g. "Open on kanban") and auto-closes
 * after a few seconds if no action is taken.
 */
export function SuccessModal({ open, onClose, title, body, actionLabel, onAction }: SuccessToastProps) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(onClose, 6000)
    return () => clearTimeout(t)
  }, [open, onClose])
  if (!open) return null
  return (
    <Backdrop onClose={onClose}>
      <div className="p-5 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center mb-3">
          <span className="text-2xl">✓</span>
        </div>
        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">{title}</h3>
        {body && <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">{body}</p>}
      </div>
      <div className="flex gap-2 px-5 pb-5">
        <button
          onClick={onClose}
          className="flex-1 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          Dismiss
        </button>
        {actionLabel && onAction && (
          <button
            onClick={() => { onAction(); onClose() }}
            className={`flex-1 px-3 py-2 text-sm font-semibold rounded-md ${TONE_BTN.success}`}
          >
            {actionLabel}
          </button>
        )}
      </div>
    </Backdrop>
  )
}
