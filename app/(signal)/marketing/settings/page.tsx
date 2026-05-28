import { SignalTopbar } from '@/components/signal/topbar'
import { SignalSocialConnections } from '@/components/signal/social-connections'
import { query } from '@/lib/db'

interface ConnectedAccount {
  id: string
  platform: string
  account_label: string
  external_urn: string | null
  scopes: string[] | null
  expires_at: string | null
  connected_at: string
}

async function getAccounts(): Promise<ConnectedAccount[]> {
  try {
    const r = await query(`
      SELECT id, platform, account_label, external_urn, scopes, expires_at, connected_at
      FROM marketing_social_accounts
      WHERE revoked_at IS NULL
      ORDER BY platform, connected_at DESC
    `)
    return r.rows as ConnectedAccount[]
  } catch (e) {
    return []
  }
}

interface PageProps {
  searchParams: Promise<{ social_connected?: string; social_error?: string }>
}

export default async function SignalSettings({ searchParams }: PageProps) {
  const accounts = await getAccounts()
  const params = await searchParams
  return (
    <div className="flex flex-col">
      <SignalTopbar
        title="Settings"
        description="Channel connections, voice training, approval flow."
      />
      <SignalSocialConnections
        accounts={accounts}
        notice={
          params.social_connected
            ? { kind: 'ok', message: `Connected to ${params.social_connected}.` }
            : params.social_error
              ? { kind: 'err', message: `Connection failed: ${params.social_error}` }
              : null
        }
      />
    </div>
  )
}
