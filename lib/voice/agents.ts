import { query } from '@/lib/db'

export interface VoiceAgent {
  id: string
  slug: string
  name: string
  description: string | null
  systemPrompt: string | null
  kbText: string | null
  ttsProvider: string
  ttsVoice: string
  ttsModel: string | null
  llmProvider: string | null
  allowedTools: string[] | null
  visibility: 'internal' | 'public'
  embedOrigins: string[] | null
  greeting: string | null
  isActive: boolean
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

interface AgentRow {
  id: string
  slug: string
  name: string
  description: string | null
  system_prompt: string | null
  kb_text: string | null
  tts_provider: string
  tts_voice: string
  tts_model: string | null
  llm_provider: string | null
  allowed_tools: string[] | null
  visibility: 'internal' | 'public'
  embed_origins: string[] | null
  greeting: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
  updated_at: string
}

function rowOf(r: AgentRow): VoiceAgent {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    systemPrompt: r.system_prompt,
    kbText: r.kb_text,
    ttsProvider: r.tts_provider,
    ttsVoice: r.tts_voice,
    ttsModel: r.tts_model,
    llmProvider: r.llm_provider,
    allowedTools: r.allowed_tools,
    visibility: r.visibility,
    embedOrigins: r.embed_origins,
    greeting: r.greeting,
    isActive: r.is_active,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listVoiceAgents(opts: { includeInactive?: boolean } = {}): Promise<VoiceAgent[]> {
  const where = opts.includeInactive ? '' : 'WHERE is_active = true'
  const r = await query(`SELECT * FROM voice_agents ${where} ORDER BY created_at ASC`)
  return (r.rows as AgentRow[]).map(rowOf)
}

export async function getVoiceAgentById(id: string): Promise<VoiceAgent | null> {
  const r = await query(`SELECT * FROM voice_agents WHERE id = $1::uuid LIMIT 1`, [id])
  return r.rows[0] ? rowOf(r.rows[0] as AgentRow) : null
}

export async function getVoiceAgentBySlug(slug: string): Promise<VoiceAgent | null> {
  const r = await query(`SELECT * FROM voice_agents WHERE slug = $1 LIMIT 1`, [slug])
  return r.rows[0] ? rowOf(r.rows[0] as AgentRow) : null
}

export async function getVoiceAgent(idOrSlug: string): Promise<VoiceAgent | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrSlug)
  return isUuid ? getVoiceAgentById(idOrSlug) : getVoiceAgentBySlug(idOrSlug)
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'agent'
}

async function ensureUniqueSlug(base: string): Promise<string> {
  const candidate = slugify(base)
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? candidate : `${candidate}-${i + 1}`
    const exists = await query(`SELECT 1 FROM voice_agents WHERE slug = $1 LIMIT 1`, [slug])
    if (exists.rowCount === 0) return slug
  }
  return `${candidate}-${Date.now().toString(36)}`
}

export interface CreateVoiceAgentInput {
  name: string
  slug?: string
  description?: string | null
  systemPrompt?: string | null
  kbText?: string | null
  ttsProvider?: string
  ttsVoice?: string
  ttsModel?: string | null
  llmProvider?: string | null
  allowedTools?: string[] | null
  visibility?: 'internal' | 'public'
  embedOrigins?: string[] | null
  greeting?: string | null
  createdBy?: string | null
}

export async function createVoiceAgent(input: CreateVoiceAgentInput): Promise<VoiceAgent> {
  const slug = await ensureUniqueSlug(input.slug || input.name)
  const r = await query(
    `INSERT INTO voice_agents
       (slug, name, description, system_prompt, kb_text, tts_provider, tts_voice, tts_model,
        llm_provider, allowed_tools, visibility, embed_origins, greeting, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     RETURNING *`,
    [
      slug,
      input.name.trim(),
      input.description ?? null,
      input.systemPrompt ?? null,
      input.kbText ?? null,
      input.ttsProvider || 'mimo',
      input.ttsVoice || 'mimo_default',
      input.ttsModel ?? null,
      input.llmProvider ?? null,
      input.allowedTools ?? null,
      input.visibility || 'internal',
      input.embedOrigins ?? null,
      input.greeting ?? null,
      input.createdBy ?? null,
    ]
  )
  return rowOf(r.rows[0] as AgentRow)
}

export interface UpdateVoiceAgentInput {
  name?: string
  description?: string | null
  systemPrompt?: string | null
  kbText?: string | null
  ttsProvider?: string
  ttsVoice?: string
  ttsModel?: string | null
  llmProvider?: string | null
  allowedTools?: string[] | null
  visibility?: 'internal' | 'public'
  embedOrigins?: string[] | null
  greeting?: string | null
  isActive?: boolean
}

export async function updateVoiceAgent(id: string, patch: UpdateVoiceAgentInput): Promise<VoiceAgent | null> {
  const fields: string[] = []
  const values: unknown[] = []
  const fieldMap: Record<keyof UpdateVoiceAgentInput, string> = {
    name: 'name',
    description: 'description',
    systemPrompt: 'system_prompt',
    kbText: 'kb_text',
    ttsProvider: 'tts_provider',
    ttsVoice: 'tts_voice',
    ttsModel: 'tts_model',
    llmProvider: 'llm_provider',
    allowedTools: 'allowed_tools',
    visibility: 'visibility',
    embedOrigins: 'embed_origins',
    greeting: 'greeting',
    isActive: 'is_active',
  }
  for (const key of Object.keys(patch) as (keyof UpdateVoiceAgentInput)[]) {
    if (patch[key] === undefined) continue
    values.push(patch[key])
    fields.push(`${fieldMap[key]} = $${values.length}`)
  }
  if (fields.length === 0) return getVoiceAgentById(id)
  values.push(id)
  const r = await query(
    `UPDATE voice_agents SET ${fields.join(', ')}, updated_at = NOW()
     WHERE id = $${values.length}::uuid
     RETURNING *`,
    values
  )
  return r.rows[0] ? rowOf(r.rows[0] as AgentRow) : null
}

export async function deleteVoiceAgent(id: string): Promise<boolean> {
  const r = await query(`DELETE FROM voice_agents WHERE id = $1::uuid`, [id])
  return (r.rowCount || 0) > 0
}
