// Required configuration: MSGRAPH_TENANT_ID, MSGRAPH_CLIENT_ID,
// MSGRAPH_CLIENT_SECRET, and SLACK_PHOTO_FOLDER_URL.

const GRAPH_CONFIG_KEYS = [
  'MSGRAPH_TENANT_ID',
  'MSGRAPH_CLIENT_ID',
  'MSGRAPH_CLIENT_SECRET',
  'SLACK_PHOTO_FOLDER_URL',
] as const

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0'
const UPLOAD_CHUNK_BYTES = 5 * 1024 * 1024

let cachedToken: { value: string; expiresAt: number } | null = null
let cachedFolderTarget: { driveId: string; folderId: string } | null = null

function missingConfig(): string[] {
  return GRAPH_CONFIG_KEYS.filter(key => !process.env[key]?.trim())
}

export function graphConfigured(): boolean {
  return missingConfig().length === 0
}

export function ensureConfigError(): string {
  const missing = missingConfig()
  return missing.length > 0
    ? `Missing required environment variables: ${missing.join(', ')}`
    : ''
}

export async function getGraphToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value

  const configError = ensureConfigError()
  if (configError) throw new Error(configError)

  const tenantId = process.env.MSGRAPH_TENANT_ID as string
  const body = new URLSearchParams({
    client_id: process.env.MSGRAPH_CLIENT_ID as string,
    client_secret: process.env.MSGRAPH_CLIENT_SECRET as string,
    grant_type: 'client_credentials',
    scope: 'https://graph.microsoft.com/.default',
  })
  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    }
  )
  const payload = await response.json()
  if (!response.ok || !payload.access_token) {
    throw new Error(`Microsoft Graph token request failed: ${payload.error_description || payload.error || response.status}`)
  }

  const expiresIn = Number(payload.expires_in) || 0
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(0, expiresIn - 120) * 1000,
  }
  return cachedToken.value
}

export async function resolveFolderTarget(token: string): Promise<{ driveId: string; folderId: string }> {
  if (cachedFolderTarget) return cachedFolderTarget

  const folderUrl = process.env.SLACK_PHOTO_FOLDER_URL
  if (!folderUrl) throw new Error(ensureConfigError())

  const encoded = Buffer.from(folderUrl, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  const response = await fetch(
    `${GRAPH_BASE}/shares/u!${encoded}/driveItem?$select=id,parentReference`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const payload = await response.json()
  const driveId = payload.parentReference?.driveId
  const folderId = payload.id
  if (!response.ok || !driveId || !folderId) {
    throw new Error(`Microsoft Graph folder resolution failed: ${payload.error?.message || response.status}`)
  }

  cachedFolderTarget = { driveId, folderId }
  return cachedFolderTarget
}

export async function uploadFile(subPath: string, data: Buffer): Promise<{ webUrl: string }> {
  const token = await getGraphToken()
  const { driveId, folderId } = await resolveFolderTarget(token)
  const encodedPath = subPath.split('/').map(segment => encodeURIComponent(segment)).join('/')
  const sessionResponse = await fetch(
    `${GRAPH_BASE}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(folderId)}:/${encodedPath}:/createUploadSession`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'rename' } }),
    }
  )
  const session = await sessionResponse.json()
  if (!sessionResponse.ok || !session.uploadUrl) {
    throw new Error(`Microsoft Graph upload session failed: ${session.error?.message || sessionResponse.status}`)
  }
  if (data.length === 0) throw new Error('Cannot upload an empty file')

  let completed: any = null
  for (let start = 0; start < data.length; start += UPLOAD_CHUNK_BYTES) {
    const end = Math.min(start + UPLOAD_CHUNK_BYTES, data.length) - 1
    const chunk = data.subarray(start, end + 1)
    const uploadResponse = await fetch(session.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Length': String(chunk.length),
        'Content-Range': `bytes ${start}-${end}/${data.length}`,
      },
      body: new Uint8Array(chunk),
    })
    const payload = await uploadResponse.json()
    if (!uploadResponse.ok) {
      throw new Error(`Microsoft Graph chunk upload failed: ${payload.error?.message || uploadResponse.status}`)
    }
    if (uploadResponse.status !== 202) completed = payload
  }

  if (!completed?.webUrl) throw new Error('Microsoft Graph upload completed without a webUrl')
  return { webUrl: completed.webUrl }
}
