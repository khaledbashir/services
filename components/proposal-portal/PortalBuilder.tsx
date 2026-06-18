'use client'

import { PORTAL_MODULES, toggleModule } from '@/lib/proposal-portal/modules'
import { PORTAL_RECIPES, modulesForRecipe } from '@/lib/proposal-portal/recipes'
import { parsePortalIntent } from '@/lib/proposal-portal/parse-intent'
import {
  type PortalClientData,
  type PortalModuleId,
  type PortalRecipeId,
} from '@/lib/proposal-portal/types'
import { ThemeToggle } from '@/components/theme-toggle'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PortalViewer } from './PortalViewer'
import './portal-builder.css'

type Message = { role: 'user' | 'assistant'; content: string }
type Provider = {
  name: string
  label?: string
  model: string
  availableModels?: string[]
}

const PORTAL_PROVIDER_KEY = 'portal-builder-provider'
const PORTAL_MODEL_KEY = 'portal-builder-model'

function providerPriority(p: Provider): number {
  const text = `${p.name} ${p.model}`.toLowerCase()
  if (text.includes('ollama-cloud')) return 0
  if (text.includes('glm-5.2')) return 0
  if (text.includes('glm')) return 1
  if (text.includes('kimi')) return 2
  return 3
}

const MODULE_BLUEPRINTS: Record<PortalModuleId, { job: string; output: string; connects: string }> = {
  'deal-deck': {
    job: 'Tell the sales or executive story with visuals, proof, investment, and the close.',
    output: 'Public presentation/deck section.',
    connects: 'Presentation link, documents, approvals.',
  },
  'customer-portal': {
    job: 'Give the client a logged-in home base for their venues, account status, requests, and ANC contacts.',
    output: 'Overview landing page and portal navigation.',
    connects: 'Customer login, organization, linked venues.',
  },
  tickets: {
    job: 'Let the client submit issues, track status, reply, and see open/resolved cases.',
    output: 'Service request list, intake form, ticket detail.',
    connects: 'Tickets API, venue IDs, Slack/email notification path.',
  },
  'service-health': {
    job: 'Show venue display inventory, open work, active risks, maintenance state, and readiness.',
    output: 'Service Health page.',
    connects: 'Display registry, open tickets, venue service records.',
  },
  'ai-diagnosis': {
    job: 'Use a photo/symptom prompt as first-line triage before a service request reaches ANC.',
    output: 'AI Diagnosis page and ticket creation path.',
    connects: 'Customer ticket API, AI/copilot, venue routing.',
  },
  documents: {
    job: 'Centralize reports, drawings, proof assets, manuals, specs, and client downloads.',
    output: 'Document library.',
    connects: 'Customer documents API and shared file records.',
  },
  approvals: {
    job: 'Give the client a clear review queue for proof files, scope decisions, and requested changes.',
    output: 'Approval queue and decision controls.',
    connects: 'Documents, design/proof workflow, service decisions.',
  },
  'reports-qbr': {
    job: 'Summarize service performance, ticket trends, completed work, and renewal/QBR proof.',
    output: 'Reports page and monthly readout.',
    connects: 'Ticket stats, venues, documents, service history.',
  },
  onboarding: {
    job: 'Explain how to use the portal, what is in scope, and how escalation works.',
    output: 'Orientation page.',
    connects: 'Requests, diagnosis, documents, contacts.',
  },
}

type PortalBuilderProps = {
  portalId: string
  initialTitle: string
  initialRecipe: PortalRecipeId
  initialModules: PortalModuleId[]
  initialData: PortalClientData
  initialPublic: boolean
}

export function PortalBuilder({
  portalId,
  initialTitle,
  initialRecipe,
  initialModules,
  initialData,
  initialPublic,
}: PortalBuilderProps) {
  const [title, setTitle] = useState(initialTitle)
  const [recipe, setRecipe] = useState<PortalRecipeId>(initialRecipe)
  const [modules, setModules] = useState<PortalModuleId[]>(initialModules)
  const [data, setData] = useState<PortalClientData>(initialData)
  const [isPublic, setIsPublic] = useState(initialPublic)
  const [saving, setSaving] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Tell me what this should become: a presentation, service portal, issue intake, onboarding space, QBR, or a hybrid. I will assemble the modules and preview from the prompt.',
    },
  ])
  const [focusedModule, setFocusedModule] = useState<PortalModuleId>('customer-portal')
  const [providers, setProviders] = useState<Provider[]>([])
  const [selectedProvider, setSelectedProvider] = useState('')
  const [selectedModel, setSelectedModel] = useState('')

  const shareUrl = useMemo(() => {
    if (typeof window === 'undefined') return `/client-portals/p/${portalId}`
    return `${window.location.origin}/client-portals/p/${portalId}`
  }, [portalId])

  const save = useCallback(
    async (patch?: {
      title?: string
      recipe?: PortalRecipeId
      enabledModules?: PortalModuleId[]
      data?: PortalClientData
      isPublic?: boolean
    }) => {
      setSaving(true)
      try {
        const res = await fetch(`/api/proposal-portals/${portalId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: patch?.title ?? title,
            recipe: patch?.recipe ?? recipe,
            enabledModules: patch?.enabledModules ?? modules,
            clientData: patch?.data ?? data,
            isPublic: patch?.isPublic,
          }),
        })
        if (!res.ok) throw new Error('save failed')
        const json = (await res.json()) as { isPublic?: boolean }
        if (typeof json.isPublic === 'boolean') setIsPublic(json.isPublic)
      } finally {
        setSaving(false)
      }
    },
    [portalId, title, recipe, modules, data],
  )

  useEffect(() => {
    const storedProvider = typeof window !== 'undefined' ? localStorage.getItem(PORTAL_PROVIDER_KEY) || '' : ''
    const storedModel = typeof window !== 'undefined' ? localStorage.getItem(PORTAL_MODEL_KEY) || '' : ''
    let cancelled = false
    async function load() {
      const res = await fetch('/api/ai/providers')
      if (!res.ok) return
      const json = (await res.json()) as { providers?: Provider[] }
      if (cancelled) return
      const ranked = [...(json.providers || [])].sort((a, b) => providerPriority(a) - providerPriority(b))
      setProviders(ranked)
      const nextProvider = ranked.find((p) => p.name === storedProvider) || ranked[0]
      if (nextProvider) {
        setSelectedProvider(nextProvider.name)
        const models = nextProvider.availableModels?.length ? nextProvider.availableModels : [nextProvider.model]
        setSelectedModel(models.includes(storedModel) ? storedModel : nextProvider.model)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!selectedProvider || typeof window === 'undefined') return
    localStorage.setItem(PORTAL_PROVIDER_KEY, selectedProvider)
  }, [selectedProvider])

  useEffect(() => {
    if (!selectedModel || typeof window === 'undefined') return
    localStorage.setItem(PORTAL_MODEL_KEY, selectedModel)
  }, [selectedModel])

  useEffect(() => {
    const provider = providers.find((p) => p.name === selectedProvider)
    if (!provider) return
    const options = provider.availableModels?.length ? provider.availableModels : [provider.model]
    if (!selectedModel || !options.includes(selectedModel)) setSelectedModel(provider.model)
  }, [providers, selectedProvider, selectedModel])

  const applyRecipe = (id: PortalRecipeId) => {
    const next = modulesForRecipe(id)
    setRecipe(id)
    setModules(next)
    setFocusedModule(next[0] ?? 'customer-portal')
    void save({ recipe: id, enabledModules: next })
  }

  const onToggle = (id: PortalModuleId, on: boolean) => {
    const next = toggleModule(modules, id, on)
    setModules(next)
    setRecipe('custom')
    setFocusedModule(id)
    void save({ enabledModules: next, recipe: 'custom' })
  }

  const onSend = async () => {
    const text = input.trim()
    if (!text || thinking) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])
    setThinking(true)
    let result: ReturnType<typeof parsePortalIntent> & { focusModule?: PortalModuleId }
    try {
      const res = await fetch('/api/proposal-portals/assemble', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          currentModules: modules,
          currentRecipe: recipe,
          currentData: data,
          provider: selectedProvider || undefined,
          model: selectedModel || undefined,
        }),
      })
      if (!res.ok) throw new Error('assemble failed')
      result = (await res.json()) as ReturnType<typeof parsePortalIntent> & { focusModule?: PortalModuleId }
    } catch {
      result = parsePortalIntent(text, modules, recipe)
    } finally {
      setThinking(false)
    }

    const nextData = { ...data, ...result.data }
    const nextTitle = result.data.clientName ? `${result.data.clientName} — Client Portal` : title
    setModules(result.enabledModules)
    setRecipe(result.recipe)
    setFocusedModule(result.focusModule ?? result.enabledModules[0] ?? 'customer-portal')
    setData(nextData)
    if (result.data.clientName) {
      setTitle(nextTitle)
    }
    setMessages((m) => [...m, { role: 'assistant', content: result.reply }])
    void save({
      enabledModules: result.enabledModules,
      recipe: result.recipe,
      data: nextData,
      title: nextTitle,
    })
  }

  const publish = async () => {
    await save({ isPublic: true })
  }

  return (
    <div className="portal-workspace">
      <header className="top">
        <div>
          <h1>{title}</h1>
          <div className="meta">
            {recipe === 'custom' ? 'custom preset' : `${PORTAL_RECIPES.find((r) => r.id === recipe)?.label ?? recipe} preset`} · {modules.length} modules · {isPublic ? 'live link' : 'draft'}
          </div>
        </div>
        <div className="actions">
          <div className="theme-box">
            <ThemeToggle />
          </div>
          <Link className="btn" href="/client-portals">← All portals</Link>
          {isPublic && (
            <a className="btn" href={shareUrl} target="_blank" rel="noreferrer">
              Open client link
            </a>
          )}
          <button type="button" className="btn" onClick={() => void save()} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="btn primary" onClick={() => void publish()} disabled={saving}>
            Publish link
          </button>
        </div>
      </header>

      <aside className="modules">
        <h2>Presets</h2>
        <div className="recipe-row">
          {PORTAL_RECIPES.map((r) => (
            <button
              key={r.id}
              type="button"
              className={`recipe-pill ${recipe === r.id ? 'active' : ''}`}
              onClick={() => applyRecipe(r.id)}
              title={r.tagline}
            >
              {r.label}
            </button>
          ))}
        </div>
        <h2>Modules</h2>
        {PORTAL_MODULES.map((mod) => {
          const on = modules.includes(mod.id)
          const blueprint = MODULE_BLUEPRINTS[mod.id]
          return (
            <div
              key={mod.id}
              className={`module-row ${on ? '' : 'off'} ${focusedModule === mod.id ? 'focused' : ''} ${mod.implemented ? '' : 'missing'}`}
              onClick={() => setFocusedModule(mod.id)}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={mod.required || !mod.implemented}
                onChange={(e) => onToggle(mod.id, e.target.checked)}
                onClick={(event) => event.stopPropagation()}
              />
              <label>
                <b>{mod.label}{mod.required ? ' · required' : ''}{!mod.implemented ? ' · coming' : ''}</b>
                <span>{blueprint.job}</span>
                <small>{blueprint.output} Connects to: {blueprint.connects}</small>
              </label>
            </div>
          )
        })}
      </aside>

      <section className="preview">
        <div className="preview-note">Live preview — scroll inside to feel motion</div>
        <div className="portal-preview-canvas">
          <PortalViewer
            embedded
            showHud={false}
            focusModule={focusedModule}
            document={{ title, mode: 'PROPOSAL', recipe, enabledModules: modules, data }}
          />
        </div>
      </section>

      <aside className="chat">
        <div className="chat-head">
          <h2>Build by talking</h2>
          {providers.length > 0 && (
            <div className="model-controls">
              <select
                value={selectedProvider}
                onChange={(e) => {
                  const provider = providers.find((p) => p.name === e.target.value)
                  setSelectedProvider(e.target.value)
                  setSelectedModel(provider?.model || '')
                }}
                disabled={thinking}
                aria-label="AI provider"
              >
                {providers.map((p) => (
                  <option key={p.name} value={p.name}>{p.label || p.name}</option>
                ))}
              </select>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={thinking || !selectedProvider}
                aria-label="AI model"
              >
                {(providers.find((p) => p.name === selectedProvider)?.availableModels || []).map((model) => (
                  <option key={model} value={model}>{model}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
          {thinking && <div className="bubble assistant">Building with {selectedModel || 'the selected model'}…</div>}
        </div>
        <div className="chat-input">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='e.g. "make this an issue intake portal with tickets, AI diagnosis, docs, and onboarding"'
            disabled={thinking}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void onSend()
              }
            }}
          />
          <button type="button" onClick={() => void onSend()} aria-label="Send" disabled={thinking || !input.trim()}>
            {thinking ? '…' : '→'}
          </button>
        </div>
      </aside>
    </div>
  )
}
