'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Sparkles, Mic2, Users, CalendarDays, BarChart3, Settings, ArrowLeft } from 'lucide-react'

const ITEMS = [
  { href: '/marketing', label: 'Compose', icon: Sparkles },
  { href: '/marketing/voice', label: 'Voice', icon: Mic2 },
  { href: '/marketing/audiences', label: 'Audiences', icon: Users },
  { href: '/marketing/calendar', label: 'Calendar', icon: CalendarDays },
  { href: '/marketing/insights', label: 'Insights', icon: BarChart3 },
  { href: '/marketing/settings', label: 'Settings', icon: Settings },
]

export function SignalSidebar() {
  const pathname = usePathname() || ''
  return (
    <nav className="flex h-full w-[220px] shrink-0 flex-col border-r border-border bg-background">
      <div className="flex h-14 items-center gap-2 px-4 border-b border-border">
        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground text-[10.5px] font-semibold tracking-tight">
          S
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[12.5px] font-semibold">Signal</span>
          <span className="text-[10px] text-muted-foreground">ANC Marketing</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {ITEMS.map((item) => {
          const active = pathname === item.href || (item.href !== '/marketing' && pathname.startsWith(item.href))
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px] font-medium transition-colors',
                active
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
              )}
            >
              <Icon className="size-3.5" />
              {item.label}
            </Link>
          )
        })}
      </div>
      <div className="border-t border-border p-2">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11.5px] text-muted-foreground hover:bg-accent/60 hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to Services Dashboard
        </Link>
      </div>
    </nav>
  )
}
