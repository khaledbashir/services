'use client'

import { PORTAL_MODULES, toggleModule } from '@/lib/proposal-portal/modules'
import { PORTAL_RECIPES, modulesForRecipe } from '@/lib/proposal-portal/recipes'
import { parsePortalIntent } from '@/lib/proposal-portal/parse-intent'
import {
  type PortalClientData,
  type PortalModuleId,
  type PortalRecipeId,
} from '@/lib/proposal-portal/types'
import Link from 'next/link'
import { useCallback, useMemo, useState } from 'react'
import { PortalViewer } from './PortalViewer'
import './portal-builder.css'

type Message = { role: 'user' | 'assistant'; content: string }

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
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        'Tell me the client, preset, and modules you want — for example: service portal with tickets, AI diagnosis, documents, and onboarding. Watch the portal assemble live.',
    },
  ])

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

  const applyRecipe = (id: PortalRecipeId) => {
    const next = modulesForRecipe(id)
    setRecipe(id)
    setModules(next)
    void save({ recipe: id, enabledModules: next })
  }

  const onToggle = (id: PortalModuleId, on: boolean) => {
    const next = toggleModule(modules, id, on)
    setModules(next)
    setRecipe('custom')
    void save({ enabledModules: next, recipe: 'custom' })
  }

  const onSend = () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    setMessages((m) => [...m, { role: 'user', content: text }])
    const result = parsePortalIntent(text, modules, recipe)
    setModules(result.enabledModules)
    setRecipe(result.recipe)
    setData((prev) => ({ ...prev, ...result.data }))
    if (result.data.clientName) {
      setTitle(`${result.data.clientName} — Client Portal`)
    }
    setMessages((m) => [...m, { role: 'assistant', content: result.reply }])
    void save({
      enabledModules: result.enabledModules,
      recipe: result.recipe,
      data: { ...data, ...result.data },
      title: result.data.clientName ? `${result.data.clientName} — Client Portal` : title,
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
          return (
            <div
              key={mod.id}
              className={`module-row ${on ? '' : 'off'} ${mod.implemented ? '' : 'missing'}`}
            >
              <input
                type="checkbox"
                checked={on}
                disabled={mod.required || !mod.implemented}
                onChange={(e) => onToggle(mod.id, e.target.checked)}
              />
              <label>
                <b>{mod.label}{mod.required ? ' · required' : ''}{!mod.implemented ? ' · coming' : ''}</b>
                <span>{mod.description}</span>
              </label>
            </div>
          )
        })}
      </aside>

      <section className="preview">
        <div className="preview-note">Live preview — scroll inside to feel motion</div>
        <PortalViewer
          embedded
          showHud={false}
          document={{ title, mode: 'PROPOSAL', recipe, enabledModules: modules, data }}
        />
      </section>

      <aside className="chat">
        <h2 style={{ padding: '14px 14px 0' }}>Build by talking</h2>
        <div className="chat-messages">
          {messages.map((m, i) => (
            <div key={i} className={`bubble ${m.role}`}>
              {m.content}
            </div>
          ))}
        </div>
        <div className="chat-input">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder='e.g. "make this an issue intake portal with tickets and AI diagnosis"'
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                onSend()
              }
            }}
          />
          <button type="button" onClick={onSend} aria-label="Send">
            →
          </button>
        </div>
      </aside>
    </div>
  )
}
