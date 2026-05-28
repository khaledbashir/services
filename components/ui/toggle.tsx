'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'

interface ChannelPillProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean
  icon?: React.ReactNode
  label: string
}
export function ChannelPill({ active, icon, label, className, ...props }: ChannelPillProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-all',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        active
          ? 'border-primary/40 bg-primary/15 text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.3)_inset]'
          : 'border-border bg-transparent text-muted-foreground hover:text-foreground hover:bg-accent',
        className,
      )}
      {...props}
    >
      {icon && <span className={cn('flex items-center', active ? 'text-primary' : 'text-muted-foreground')}>{icon}</span>}
      <span>{label}</span>
    </button>
  )
}
