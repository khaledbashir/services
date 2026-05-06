'use client'

interface MorningCommandAction {
  label: string
  description: string
  prompt: string
}

interface MorningCommandActionsProps {
  actions: MorningCommandAction[]
}

export function MorningCommandActions({ actions }: MorningCommandActionsProps) {
  const launch = (prompt: string) => {
    window.dispatchEvent(new CustomEvent('anc:ai-send-prompt', { detail: { prompt } }))
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={() => launch(action.prompt)}
          className="group rounded border border-[#E8E8E8] bg-white px-4 py-3 text-left shadow-sm transition hover:border-[#0A52EF]/40 hover:bg-[#0A52EF]/[0.03] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#0A52EF]/30 dark:border-[var(--anc-border)] dark:bg-[var(--anc-surface)] dark:hover:bg-[#0A52EF]/10"
        >
          <span className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{action.label}</span>
            <span className="text-xs font-medium text-[#0A52EF] opacity-80 transition group-hover:translate-x-0.5">Run</span>
          </span>
          <span className="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{action.description}</span>
        </button>
      ))}
    </div>
  )
}
