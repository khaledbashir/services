'use client'
import * as React from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { MessageSquare, Mail, Sparkles, Plus, ExternalLink, AlertCircle, Check } from 'lucide-react'

interface ConnectedAccount {
  id: string
  platform: string
  account_label: string
  external_urn: string | null
  scopes: string[] | null
  expires_at: string | null
  connected_at: string
}

interface PlatformDef {
  key: string
  label: string
  icon: React.ReactNode
  connectHref: string
  description: string
  enabled: boolean
}

function LinkedinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.61 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 11-.001-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45z" />
    </svg>
  )
}

const PLATFORMS: PlatformDef[] = [
  {
    key: 'linkedin',
    label: 'LinkedIn',
    icon: <LinkedinIcon className="size-4" />,
    connectHref: '/api/marketing/social/connect/linkedin?returnTo=/marketing/settings',
    description: 'Personal profile posting via your LinkedIn account.',
    enabled: true,
  },
  {
    key: 'slack',
    label: 'Slack',
    icon: <MessageSquare className="size-4" />,
    connectHref: '#',
    description: 'Direct channel + DM posting through your Slack workspace.',
    enabled: false,
  },
  {
    key: 'newsletter',
    label: 'Newsletter',
    icon: <Mail className="size-4" />,
    connectHref: '#',
    description: 'Sends via SendGrid (already wired). Audience comes from CRM.',
    enabled: false,
  },
]

interface Props {
  accounts: ConnectedAccount[]
  notice: { kind: 'ok' | 'err'; message: string } | null
}

export function SignalSocialConnections({ accounts, notice }: Props) {
  return (
    <div className="flex flex-col gap-4 p-6">
      {notice && (
        <Card
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 text-[12px]',
            notice.kind === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/8 text-emerald-300'
              : 'border-destructive/40 bg-destructive/8 text-destructive',
          )}
        >
          {notice.kind === 'ok' ? <Check className="size-3.5" /> : <AlertCircle className="size-3.5" />}
          {notice.message}
        </Card>
      )}

      <div>
        <h2 className="text-[14px] font-semibold tracking-tight">Channels</h2>
        <p className="text-[11.5px] text-muted-foreground mt-0.5">
          Connect once. Signal posts directly from anc-services — no third-party middleware.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((p) => {
          const connected = accounts.filter((a) => a.platform === p.key)
          return (
            <Card key={p.key} className="flex flex-col">
              <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{p.icon}</span>
                  <span className="text-[13px] font-semibold">{p.label}</span>
                </div>
                {connected.length > 0 ? (
                  <Badge variant="success">{connected.length} connected</Badge>
                ) : p.enabled ? (
                  <Badge variant="outline">Not connected</Badge>
                ) : (
                  <Badge variant="ghost">Coming next</Badge>
                )}
              </div>
              <div className="px-4 py-3 text-[11.5px] text-muted-foreground flex-1">
                {p.description}
              </div>
              {connected.length > 0 && (
                <div className="border-t border-border px-4 py-2.5 space-y-1.5">
                  {connected.map((a) => {
                    const expired = a.expires_at && new Date(a.expires_at).getTime() < Date.now()
                    return (
                      <div key={a.id} className="flex items-center justify-between text-[11.5px]">
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium text-foreground">{a.account_label}</span>
                          <span className="text-muted-foreground">
                            Connected {new Date(a.connected_at).toLocaleDateString()}
                            {a.expires_at && (
                              <>
                                {' · '}
                                {expired ? (
                                  <span className="text-destructive">Expired</span>
                                ) : (
                                  <>Expires {new Date(a.expires_at).toLocaleDateString()}</>
                                )}
                              </>
                            )}
                          </span>
                        </div>
                        {expired && <Badge variant="danger">re-auth</Badge>}
                      </div>
                    )
                  })}
                </div>
              )}
              <div className="border-t border-border px-3 py-2">
                {p.enabled ? (
                  <Button asChild size="sm" variant={connected.length ? 'outline' : 'default'} className="w-full">
                    <a href={p.connectHref}>
                      <Plus className="size-3.5" />
                      {connected.length ? 'Connect another' : `Connect ${p.label}`}
                    </a>
                  </Button>
                ) : (
                  <Button size="sm" variant="ghost" className="w-full" disabled>
                    {p.label} — wiring next
                  </Button>
                )}
              </div>
            </Card>
          )
        })}
      </div>

      <Card className="flex items-center gap-3 px-4 py-3 text-[11.5px] text-muted-foreground">
        <Sparkles className="size-3.5 text-primary" />
        <span>
          New: Signal owns its own OAuth + posting pipeline. No more Postiz, no scope mismatches, no env-vars that vanish on restart.
        </span>
        <a
          href="https://www.linkedin.com/developers/apps"
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex items-center gap-1 text-foreground hover:underline"
        >
          LinkedIn Dev Console
          <ExternalLink className="size-3" />
        </a>
      </Card>
    </div>
  )
}
