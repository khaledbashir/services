import { Pool } from 'pg'

type ConnectedEmailAccount = {
  id: string
  handle: string | null
  provider: string
  authFailedAt: Date | string | null
  accessToken: string | null
  refreshToken: string | null
}

export type SupportMailboxSendResult = {
  id: string
  provider: 'microsoft-graph'
  from: string
}

let supportEmailAccountPool: Pool | null = null

function getTwentyCoreDatabaseUrl() {
  return (
    process.env.TWENTY_CORE_DATABASE_URL?.trim() ||
    process.env.CRM_TWENTY_CORE_DATABASE_URL?.trim() ||
    ''
  )
}

function getSupportEmailAccountPool() {
  if (!supportEmailAccountPool) {
    const connectionString = getTwentyCoreDatabaseUrl()
    if (!connectionString) {
      throw new Error('TWENTY_CORE_DATABASE_URL is not configured')
    }
    supportEmailAccountPool = new Pool({ connectionString })
  }
  return supportEmailAccountPool
}

export function getSupportMailboxHandle() {
  return (
    process.env.SERVICES_SUPPORT_MAILBOX?.trim() ||
    process.env.CRM_REPORT_MICROSOFT_HANDLE?.trim() ||
    'support@anc.com'
  )
}

async function getSupportEmailAccount() {
  const handle = getSupportMailboxHandle()
  const accountId = process.env.SERVICES_SUPPORT_CONNECTED_ACCOUNT_ID?.trim()
  const result = await getSupportEmailAccountPool().query<ConnectedEmailAccount>(
    `
      SELECT id, handle, provider, "authFailedAt", "accessToken", "refreshToken"
      FROM core."connectedAccount"
      WHERE ${accountId ? 'id = $1' : 'LOWER(handle) = LOWER($1) AND provider = $2'}
        AND "accessToken" IS NOT NULL
        AND "refreshToken" IS NOT NULL
      ORDER BY "lastCredentialsRefreshedAt" DESC NULLS LAST, "updatedAt" DESC
      LIMIT 1
    `,
    accountId ? [accountId] : [handle, 'microsoft'],
  )

  const account = result.rows[0]
  if (!account) throw new Error(`No connected Microsoft support mailbox found for ${handle}`)
  if (account.authFailedAt) throw new Error(`CRM email account ${account.handle || account.id} has an auth failure`)
  if (!account.accessToken || !account.refreshToken) {
    throw new Error(`CRM email account ${account.handle || account.id} is missing Microsoft tokens`)
  }
  return account
}

async function refreshMicrosoftAccountToken(account: ConnectedEmailAccount) {
  const clientId =
    process.env.CRM_MICROSOFT_CLIENT_ID?.trim() ||
    process.env.AUTH_MICROSOFT_ENTRA_ID_ID?.trim() ||
    process.env.AUTH_MICROSOFT_CLIENT_ID?.trim()
  const clientSecret =
    process.env.CRM_MICROSOFT_CLIENT_SECRET?.trim() ||
    process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET?.trim() ||
    process.env.AUTH_MICROSOFT_CLIENT_SECRET?.trim()

  if (!clientId || !clientSecret || !account.refreshToken) {
    throw new Error('Microsoft token refresh is not configured')
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: account.refreshToken,
    grant_type: 'refresh_token',
    scope: 'offline_access Mail.Send Mail.Read Mail.ReadWrite User.Read email openid profile',
  })

  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const token = await res.json().catch(() => ({}))
  if (!res.ok || !token.access_token) {
    throw new Error(token.error_description || token.error || `Microsoft token refresh ${res.status}`)
  }

  const accessToken = String(token.access_token)
  const refreshToken = token.refresh_token ? String(token.refresh_token) : account.refreshToken
  await getSupportEmailAccountPool().query(
    `
      UPDATE core."connectedAccount"
      SET "accessToken" = $1,
          "refreshToken" = $2,
          "lastCredentialsRefreshedAt" = NOW(),
          "updatedAt" = NOW()
      WHERE id = $3
    `,
    [accessToken, refreshToken, account.id],
  )

  return { ...account, accessToken, refreshToken }
}

function recipient(address: string) {
  return { emailAddress: { address } }
}

export async function sendSupportMailboxEmail(input: {
  to: string[]
  subject: string
  html: string
  replyTo?: string
  cc?: string[]
  bcc?: string[]
}): Promise<SupportMailboxSendResult> {
  if (!input.to.length) throw new Error('At least one recipient is required')

  let account = await getSupportEmailAccount()
  const send = (accessToken: string) =>
    fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          subject: input.subject,
          body: { contentType: 'HTML', content: input.html },
          toRecipients: input.to.map(recipient),
          replyTo: input.replyTo ? [recipient(input.replyTo)] : [],
          ccRecipients: input.cc?.map(recipient) || [],
          bccRecipients: input.bcc?.map(recipient) || [],
          ...(input.replyTo ? {
            internetMessageHeaders: [
              { name: 'Reply-To', value: input.replyTo },
            ],
          } : {}),
        },
        saveToSentItems: true,
      }),
    })

  let res = await send(account.accessToken || '')
  if (res.status === 401 || res.status === 403) {
    account = await refreshMicrosoftAccountToken(account)
    res = await send(account.accessToken || '')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body?.error?.message || `Microsoft Graph sendMail ${res.status}`)
  }

  return {
    id: `${account.handle || account.id}:${Date.now()}`,
    provider: 'microsoft-graph',
    from: account.handle || getSupportMailboxHandle(),
  }
}
