export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { requireRole, isAuthError } from '@/lib/rbac'
import { loadProviders } from '@/lib/ai/agent'
import { parsePortalIntent } from '@/lib/proposal-portal/parse-intent'
import { normalizeModuleOrder } from '@/lib/proposal-portal/modules'
import { normalizePresetId } from '@/lib/proposal-portal/recipes'
import type {
  PortalClientData,
  PortalModuleId,
  PortalRecipeId,
} from '@/lib/proposal-portal/types'

type AssemblePayload = {
  message?: string
  currentModules?: PortalModuleId[]
  currentRecipe?: PortalRecipeId
  currentData?: PortalClientData
  provider?: string
  model?: string
}

type AiAssembleResult = {
  reply?: string
  recipe?: PortalRecipeId
  enabledModules?: string[]
  data?: Partial<PortalClientData>
  focusModule?: string
}

const MODULE_IDS: PortalModuleId[] = [
  'deal-deck',
  'customer-portal',
  'tickets',
  'service-health',
  'ai-diagnosis',
  'documents',
  'approvals',
  'reports-qbr',
  'onboarding',
]

function parseJsonObject(text: string): AiAssembleResult | null {
  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as AiAssembleResult
  } catch {
    return null
  }
}

function safeDataPatch(raw: unknown): Partial<PortalClientData> {
  if (!raw || typeof raw !== 'object') return {}
  const data = raw as Record<string, unknown>
  const out: Partial<PortalClientData> = {}
  for (const key of [
    'clientName',
    'subtitle',
    'league',
    'investment',
    'investmentLabel',
    'heroImage',
    'beforeImage',
    'afterImage',
    'visionCopy',
    'programCopy',
    'brandPrimary',
    'brandAccent',
  ] satisfies Array<keyof PortalClientData>) {
    if (typeof data[key] === 'string' && data[key].trim()) {
      out[key] = data[key].trim()
    }
  }
  return out
}

function normalizeAiResult(
  ai: AiAssembleResult | null,
  fallback: ReturnType<typeof parsePortalIntent>,
): Required<Pick<AiAssembleResult, 'reply' | 'recipe' | 'enabledModules' | 'data' | 'focusModule'>> {
  const modules = normalizeModuleOrder(
    (ai?.enabledModules || fallback.enabledModules).filter((id): id is PortalModuleId =>
      MODULE_IDS.includes(id as PortalModuleId),
    ),
  )
  const focus = ai?.focusModule && MODULE_IDS.includes(ai.focusModule as PortalModuleId)
    ? ai.focusModule
    : modules[0]

  return {
    reply: typeof ai?.reply === 'string' && ai.reply.trim() ? ai.reply.trim() : fallback.reply,
    recipe: normalizePresetId(ai?.recipe || fallback.recipe),
    enabledModules: modules,
    data: { ...fallback.data, ...safeDataPatch(ai?.data) },
    focusModule: focus || 'customer-portal',
  }
}

async function askModel(payload: AssemblePayload) {
  const providers = loadProviders()
  if (providers.length === 0) return null

  const preferred = payload.provider
    ? providers.find((p) => p.name === payload.provider) || providers[0]
    : providers[0]
  const model = payload.model || preferred.model

  const system = `You configure ANC client-facing visual portals.
Return only JSON. No markdown. No prose outside JSON.

Allowed recipe ids:
sales-proposal, service-portal, renewal-qbr, issue-intake, project-onboarding, executive-review, custom.

Allowed module ids:
deal-deck, customer-portal, tickets, service-health, ai-diagnosis, documents, approvals, reports-qbr, onboarding.

Rules:
- customer-portal is always included.
- If the user asks for presentation, proposal, deal deck, sales, proof, pricing, or vision story, include deal-deck.
- If they ask for support, service, requests, issues, cases, or help desk, include tickets and service-health.
- If they mention photo, diagnose, vision, first line of defense, symptom, display issue, or knowledge base, include ai-diagnosis.
- If they mention orientation, onboarding, training, scope, contacts, or escalation, include onboarding.
- If they mention reports, monthly, renewal, QBR, executive, performance, or proof of value, include reports-qbr.
- If they ask for colors, palette, brand, or a color pair, set brandPrimary and brandAccent as hex colors.
- If they ask for blue and gold, use brandPrimary "#0A52EB" and brandAccent "#F5B84B".
- Use ANC-specific language. Never use staff names or generic placeholder people.
- Keep reply short and useful.

JSON shape:
{
  "reply": "short sentence",
  "recipe": "service-portal",
  "enabledModules": ["customer-portal","tickets"],
  "focusModule": "tickets",
  "data": {
    "clientName": "Client or venue name",
    "subtitle": "short visual subtitle",
    "league": "short context",
    "visionCopy": "one polished sentence",
    "programCopy": "one polished sentence",
    "brandPrimary": "#0A52EB",
    "brandAccent": "#F5B84B"
  }
}`

  const res = await fetch(`${preferred.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${preferred.apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      max_tokens: 900,
      messages: [
        { role: 'system', content: system },
        {
          role: 'user',
          content: JSON.stringify({
            userMessage: payload.message,
            currentRecipe: payload.currentRecipe,
            currentModules: payload.currentModules,
            currentData: payload.currentData,
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(45000),
  })
  if (!res.ok) return null
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  return parseJsonObject(json.choices?.[0]?.message?.content || '')
}

export async function POST(request: NextRequest) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  const body = (await request.json().catch(() => ({}))) as AssemblePayload
  const message = typeof body.message === 'string' ? body.message.trim() : ''
  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 })

  const currentModules = normalizeModuleOrder(body.currentModules || ['customer-portal'])
  const currentRecipe = normalizePresetId(body.currentRecipe || 'service-portal')
  const fallback = parsePortalIntent(message, currentModules, currentRecipe)
  const ai = await askModel({ ...body, message, currentModules, currentRecipe }).catch(() => null)
  const result = normalizeAiResult(ai, fallback)

  return NextResponse.json({ ok: true, ...result })
}
