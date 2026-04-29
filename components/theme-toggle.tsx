'use client'

import { useEffect, useState } from 'react'

const THEME_KEY = 'anc-theme'

type Theme = 'light' | 'dark'

function applyTheme(theme: Theme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
  localStorage.setItem(THEME_KEY, theme)
}

function Icon({ theme }: { theme: Theme }) {
  if (theme === 'dark') {
    return (
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
        <path
          d="M16.1 11.4A6.4 6.4 0 0 1 8.6 3.9 6.5 6.5 0 1 0 16.1 11.4Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    )
  }

  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <path d="M10 3V1.8M10 18.2V17M17 10h1.2M1.8 10H3M14.95 5.05l.85-.85M4.2 15.8l.85-.85M14.95 14.95l.85.85M4.2 4.2l.85.85" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="10" cy="10" r="3.6" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    const root = document.documentElement
    const initial = root.classList.contains('dark') ? 'dark' : 'light'
    setTheme(initial)

    const onStorage = (event: StorageEvent) => {
      if (event.key !== THEME_KEY) return
      const next = event.newValue === 'dark' ? 'dark' : 'light'
      root.classList.toggle('dark', next === 'dark')
      root.style.colorScheme = next
      setTheme(next)
    }

    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      type="button"
      role="switch"
      aria-checked={theme === 'dark'}
      aria-label={`Switch to ${nextTheme} mode`}
      onClick={() => {
        applyTheme(nextTheme)
        setTheme(nextTheme)
      }}
      className="w-full flex items-center justify-between gap-3 rounded-md px-3 py-2 text-[13px] text-zinc-400 transition-colors hover:bg-white/5 hover:text-white"
    >
      <span className="flex items-center gap-2.5">
        <span className="opacity-70">
          <Icon theme={theme} />
        </span>
        {theme === 'dark' ? 'Dark mode' : 'Light mode'}
      </span>
      <span className={`flex h-5 w-9 items-center rounded-full border p-0.5 transition-colors ${theme === 'dark' ? 'border-[#0A52EF]/60 bg-[#0A52EF]/50' : 'border-white/10 bg-white/10'}`}>
        <span className={`h-3.5 w-3.5 rounded-full bg-white transition-transform ${theme === 'dark' ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}
