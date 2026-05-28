'use client'
import { cn } from '@/lib/utils'
import { Sparkles } from 'lucide-react'

interface TopbarProps {
  title: string
  description?: string
  right?: React.ReactNode
}
export function SignalTopbar({ title, description, right }: TopbarProps) {
  return (
    <div className="flex h-14 items-center justify-between border-b border-border px-6">
      <div className="flex flex-col gap-0.5 leading-tight">
        <div className="flex items-center gap-2">
          <span className="text-[13.5px] font-semibold tracking-tight">{title}</span>
        </div>
        {description ? (
          <span className="text-[11.5px] text-muted-foreground">{description}</span>
        ) : null}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 rounded-full border border-border/80 bg-background px-2 py-1 text-[10.5px] text-muted-foreground">
          <Sparkles className={cn('size-3 text-primary')} />
          <span>ANC voice — trained on 32 newsletters</span>
        </div>
        {right}
      </div>
    </div>
  )
}
