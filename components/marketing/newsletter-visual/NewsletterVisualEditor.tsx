'use client'

import { cn } from '@/lib/utils'
import {
  createSection,
  exportNewsletterFullHtml,
  resolveNewsletterStyle,
  SECTION_DESCRIPTIONS,
  SECTION_LABELS,
  type NewsletterSection,
  type NewsletterSectionType,
  type NewsletterStyle,
  type NewsletterThemeId,
  type NewsletterVisualDocument,
} from '@/lib/marketing/newsletter-visual'
import {
  ArrowDown,
  ArrowUp,
  Eye,
  LayoutTemplate,
  Monitor,
  MonitorSmartphone,
  Palette,
  Plus,
  RotateCcw,
  Save,
  Send,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

const inputClass =
  'w-full rounded-xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-[#7350FF]/70 focus:ring-2 focus:ring-[#7350FF]/15'
const labelClass = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500'
const panelClass = 'rounded-2xl border border-white/8 bg-[#11141d]/90 shadow-[0_24px_80px_rgba(0,0,0,0.35)]'

type Props = {
  value: NewsletterVisualDocument
  onChange: (doc: NewsletterVisualDocument) => void
  onSave?: () => void
  saving?: boolean
  saveLabel?: string
}

function Field({
  label,
  value,
  onChange,
  multiline,
  placeholder,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      {multiline ? (
        <textarea
          className={`${inputClass} min-h-[120px] resize-y leading-relaxed`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input className={inputClass} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      )}
    </label>
  )
}

const FONT_OPTIONS: { label: string; value: string }[] = [
  { label: 'Lato (default body)', value: "Lato, Verdana, Geneva, 'Segoe UI', sans-serif" },
  { label: 'Inter', value: "Inter, Verdana, Geneva, 'Segoe UI', sans-serif" },
  { label: 'Verdana', value: "Verdana, Geneva, 'Segoe UI', sans-serif" },
  { label: 'Arial / Helvetica', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia (serif)', value: "Georgia, 'Times New Roman', serif" },
  { label: 'Trebuchet', value: "'Trebuchet MS', Verdana, sans-serif" },
  { label: 'Tahoma', value: 'Tahoma, Verdana, sans-serif' },
]

/** A clickable color swatch that opens the native picker, with the hex shown inline. */
function ColorControl({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value?: string
  /** The theme-derived default shown when no override is set */
  fallback: string
  onChange: (value: string | undefined) => void
}) {
  const effective = value || fallback
  const overridden = Boolean(value)
  return (
    <div className="block">
      <span className={labelClass}>{label}</span>
      <div className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-[#141824] px-3 py-2.5">
        <label className="relative size-7 shrink-0 cursor-pointer overflow-hidden rounded-lg border border-white/15 shadow-inner">
          <span className="block size-full" style={{ background: effective }} />
          <input
            type="color"
            value={effective}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
            aria-label={`${label} color`}
          />
        </label>
        <input
          value={effective}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs uppercase text-zinc-200 outline-none"
        />
        {overridden ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            title="Reset to theme default"
            className="shrink-0 rounded-md p-1 text-zinc-500 transition-colors hover:text-zinc-200"
          >
            <RotateCcw className="size-3.5" />
          </button>
        ) : (
          <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-zinc-600">Theme</span>
        )}
      </div>
    </div>
  )
}

function FontControl({
  label,
  value,
  fallback,
  onChange,
}: {
  label: string
  value?: string
  fallback: string
  onChange: (value: string | undefined) => void
}) {
  const isCustom = Boolean(value) && !FONT_OPTIONS.some((o) => o.value === value)
  return (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <select
        className={inputClass}
        value={value ?? '__theme__'}
        onChange={(e) => onChange(e.target.value === '__theme__' ? undefined : e.target.value)}
      >
        <option value="__theme__">Theme default</option>
        {FONT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {isCustom && <option value={value}>Custom</option>}
      </select>
      <span className="mt-1.5 block text-[11px] text-zinc-600">Falls back to {fallback.split(',')[0]} when unset.</span>
    </label>
  )
}

function RangeControl({
  label,
  value,
  fallback,
  min,
  max,
  step = 1,
  unit = 'px',
  onChange,
}: {
  label: string
  value?: number
  fallback: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number | undefined) => void
}) {
  const effective = value ?? fallback
  const overridden = value !== undefined
  return (
    <div className="block">
      <div className="mb-2 flex items-center justify-between">
        <span className={cn(labelClass, 'mb-0')}>{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-zinc-300">
            {effective}
            {unit}
          </span>
          {overridden && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              title="Reset to theme default"
              className="rounded-md p-0.5 text-zinc-500 transition-colors hover:text-zinc-200"
            >
              <RotateCcw className="size-3" />
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={effective}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-[#7350FF]"
      />
    </div>
  )
}

function GlobalStylePanel({
  doc,
  onChange,
}: {
  doc: NewsletterVisualDocument
  onChange: (doc: NewsletterVisualDocument) => void
}) {
  const resolved = resolveNewsletterStyle(doc)
  const style = doc.style || {}

  function patch(next: Partial<NewsletterStyle>) {
    const merged: NewsletterStyle = { ...style, ...next }
    // Drop keys explicitly cleared back to undefined so docs stay lean.
    for (const key of Object.keys(merged) as (keyof NewsletterStyle)[]) {
      if (merged[key] === undefined) delete merged[key]
    }
    onChange({ ...doc, style: Object.keys(merged).length ? merged : undefined })
  }

  const hasOverrides = Boolean(doc.style && Object.keys(doc.style).length)

  return (
    <div className="grid gap-6">
      <div className="grid grid-cols-2 gap-4">
        <ColorControl label="Backdrop" value={style.backgroundColor} fallback={resolved.backgroundColor} onChange={(backgroundColor) => patch({ backgroundColor })} />
        <ColorControl label="Canvas" value={style.contentBackground} fallback={resolved.contentBackground} onChange={(contentBackground) => patch({ contentBackground })} />
        <ColorControl label="Accent" value={style.accentColor} fallback={resolved.accentColor} onChange={(accentColor) => patch({ accentColor })} />
        <ColorControl label="Text" value={style.textColor} fallback={resolved.textColor} onChange={(textColor) => patch({ textColor })} />
        <ColorControl label="Links" value={style.linkColor} fallback={resolved.linkColor} onChange={(linkColor) => patch({ linkColor })} />
      </div>

      <div className="grid gap-4 border-t border-white/8 pt-5">
        <FontControl label="Heading font" value={style.headingFont} fallback={resolved.headingFont} onChange={(headingFont) => patch({ headingFont })} />
        <FontControl label="Body font" value={style.bodyFont} fallback={resolved.bodyFont} onChange={(bodyFont) => patch({ bodyFont })} />
      </div>

      <div className="grid gap-5 border-t border-white/8 pt-5">
        <RangeControl label="Content width" value={style.contentWidth} fallback={resolved.contentWidth} min={480} max={720} step={10} onChange={(contentWidth) => patch({ contentWidth })} />
        <RangeControl label="Inner padding" value={style.padding} fallback={resolved.padding} min={0} max={48} step={2} onChange={(padding) => patch({ padding })} />
      </div>

      {hasOverrides && (
        <button
          type="button"
          onClick={() => onChange({ ...doc, style: undefined })}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 px-4 py-2.5 text-sm text-zinc-300 transition-colors hover:border-white/20 hover:bg-white/[0.04]"
        >
          <RotateCcw className="size-4" />
          Reset all to theme
        </button>
      )}
    </div>
  )
}

function SectionFields({
  section,
  onPatch,
}: {
  section: NewsletterSection
  onPatch: (patch: Partial<NewsletterSection>) => void
}) {
  switch (section.type) {
    case 'hero':
      return (
        <div className="grid gap-5">
          <Field label="Eyebrow" value={section.eyebrow || ''} onChange={(eyebrow) => onPatch({ eyebrow })} />
          <Field label="Headline" value={section.headline || ''} onChange={(headline) => onPatch({ headline })} />
          <Field label="Intro" value={section.body || ''} onChange={(body) => onPatch({ body })} multiline />
          <Field label="Hero image URL" value={section.imageUrl || ''} onChange={(imageUrl) => onPatch({ imageUrl })} placeholder="https://..." />
          <Field label="Image alt text" value={section.imageAlt || ''} onChange={(imageAlt) => onPatch({ imageAlt })} />
        </div>
      )
    case 'spotlight':
      return (
        <div className="grid gap-5">
          <Field label="Label" value={section.eyebrow || ''} onChange={(eyebrow) => onPatch({ eyebrow })} />
          <Field label="Headline" value={section.headline || ''} onChange={(headline) => onPatch({ headline })} />
          <Field label="Body" value={section.body || ''} onChange={(body) => onPatch({ body })} multiline />
        </div>
      )
    case 'story':
      return (
        <div className="grid gap-5">
          <Field label="Label" value={section.eyebrow || ''} onChange={(eyebrow) => onPatch({ eyebrow })} />
          <Field label="Headline" value={section.headline || ''} onChange={(headline) => onPatch({ headline })} />
          <Field label="Body" value={section.body || ''} onChange={(body) => onPatch({ body })} multiline />
          <Field label="Image URL" value={section.imageUrl || ''} onChange={(imageUrl) => onPatch({ imageUrl })} placeholder="https://..." />
          <label className="block">
            <span className={labelClass}>Image position</span>
            <select
              className={inputClass}
              value={section.imagePosition || 'right'}
              onChange={(e) => onPatch({ imagePosition: e.target.value as 'left' | 'right' | 'full' })}
            >
              <option value="right">Image right</option>
              <option value="left">Image left</option>
            </select>
          </label>
        </div>
      )
    case 'event':
      return (
        <div className="grid gap-5">
          <Field label="Date / label" value={section.eventDate || ''} onChange={(eventDate) => onPatch({ eventDate })} />
          <Field label="Headline" value={section.headline || ''} onChange={(headline) => onPatch({ headline })} />
          <Field label="Venue" value={section.venue || ''} onChange={(venue) => onPatch({ venue })} />
          <Field label="Body" value={section.body || ''} onChange={(body) => onPatch({ body })} multiline />
          <Field label="Button label" value={section.ctaLabel || ''} onChange={(ctaLabel) => onPatch({ ctaLabel })} />
          <Field label="Button URL" value={section.ctaUrl || ''} onChange={(ctaUrl) => onPatch({ ctaUrl })} />
        </div>
      )
    case 'cta':
      return (
        <div className="grid gap-5">
          <Field label="Headline" value={section.headline || ''} onChange={(headline) => onPatch({ headline })} />
          <Field label="Body" value={section.body || ''} onChange={(body) => onPatch({ body })} multiline />
          <Field label="Button label" value={section.ctaLabel || ''} onChange={(ctaLabel) => onPatch({ ctaLabel })} />
          <Field label="Button URL" value={section.ctaUrl || ''} onChange={(ctaUrl) => onPatch({ ctaUrl })} />
        </div>
      )
    case 'divider':
      return <p className="text-sm leading-relaxed text-zinc-500">A simple divider line between content blocks.</p>
  }
}

type TestSendState = { status: 'idle' | 'sending' | 'sent' | 'error'; message?: string }

export function NewsletterVisualEditor({ value, onChange, onSave, saving, saveLabel = 'Save newsletter' }: Props) {
  const [selectedId, setSelectedId] = useState<string>(value.sections[0]?.id || '')
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')
  const [mode, setMode] = useState<'content' | 'style'>('content')
  const [testEmail, setTestEmail] = useState('')
  const [testSend, setTestSend] = useState<TestSendState>({ status: 'idle' })

  const selected = value.sections.find((section) => section.id === selectedId) || value.sections[0]
  const previewHtml = useMemo(() => exportNewsletterFullHtml(value, { preview: true }), [value])
  const resolvedStyle = useMemo(() => resolveNewsletterStyle(value), [value])

  async function sendTest() {
    const to = testEmail.trim()
    if (!to) {
      setTestSend({ status: 'error', message: 'Enter a test email address.' })
      return
    }
    setTestSend({ status: 'sending' })
    try {
      const html = exportNewsletterFullHtml(value)
      const res = await fetch('/api/marketing/newsletter/test-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, subject: value.subject || '', html }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setTestSend({ status: 'sent', message: `Test sent to ${to}.` })
      } else {
        setTestSend({ status: 'error', message: data.error || 'Could not send the test email.' })
      }
    } catch {
      setTestSend({ status: 'error', message: 'Could not reach the send service.' })
    }
  }

  function patchSection(id: string, patch: Partial<NewsletterSection>) {
    onChange({
      ...value,
      sections: value.sections.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    })
  }

  function moveSection(id: string, direction: -1 | 1) {
    const index = value.sections.findIndex((section) => section.id === id)
    const target = index + direction
    if (index < 0 || target < 0 || target >= value.sections.length) return
    const next = [...value.sections]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChange({ ...value, sections: next })
  }

  function addSection(type: NewsletterSectionType) {
    const section = createSection(type)
    onChange({ ...value, sections: [...value.sections, section] })
    setSelectedId(section.id)
  }

  function removeSection(id: string) {
    const next = value.sections.filter((section) => section.id !== id)
    onChange({ ...value, sections: next })
    if (selectedId === id) setSelectedId(next[0]?.id || '')
  }

  return (
    <div className="grid h-[calc(100vh-9.5rem)] min-h-[720px] grid-cols-1 gap-5 xl:grid-cols-[280px_minmax(420px,520px)_minmax(0,1fr)]">
      {/* Sections rail */}
      <aside className={cn(panelClass, 'flex min-h-0 flex-col overflow-hidden')}>
        <div className="border-b border-white/8 p-3">
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/10 bg-[#141824] p-1">
            <button
              type="button"
              onClick={() => setMode('content')}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                mode === 'content' ? 'bg-[#7350FF] text-white shadow-[0_4px_16px_rgba(115,80,255,0.35)]' : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              <LayoutTemplate className="size-3.5" />
              Content
            </button>
            <button
              type="button"
              onClick={() => setMode('style')}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors',
                mode === 'style' ? 'bg-[#7350FF] text-white shadow-[0_4px_16px_rgba(115,80,255,0.35)]' : 'text-zinc-400 hover:text-zinc-200',
              )}
            >
              <Palette className="size-3.5" />
              Global style
            </button>
          </div>
          <p className="mt-2.5 px-1 text-xs leading-relaxed text-zinc-500">
            {mode === 'content' ? 'Build the newsletter as stacked blocks.' : 'Set colors, fonts, and spacing for the whole email.'}
          </p>
        </div>
        <div className={cn('min-h-0 flex-1 overflow-y-auto divide-y divide-white/6', mode !== 'content' && 'hidden')}>
          {value.sections.map((section, index) => (
            <div
              key={section.id}
              className={cn(
                'flex items-start gap-3 px-4 py-3.5 transition-colors',
                selected?.id === section.id ? 'bg-[#7350FF]/12' : 'hover:bg-white/[0.03]',
              )}
            >
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(section.id)}>
                <div className="text-sm font-medium text-zinc-100">{SECTION_LABELS[section.type]}</div>
                <div className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-zinc-500">
                  {section.headline || section.eyebrow || `Block ${index + 1}`}
                </div>
              </button>
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" className="rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:text-zinc-200" onClick={() => moveSection(section.id, -1)}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" className="rounded-lg border border-white/10 p-1.5 text-zinc-500 hover:text-zinc-200" onClick={() => moveSection(section.id, 1)}>
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {mode === 'style' && (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="flex items-start gap-2.5 rounded-xl border border-[#7350FF]/20 bg-[#7350FF]/[0.06] px-4 py-3.5 text-xs leading-relaxed text-zinc-400">
              <Palette className="mt-0.5 size-4 shrink-0 text-[#7350FF]" />
              Global style applies to the entire email. Unset controls fall back to the selected theme, so older newsletters keep their look.
            </div>
          </div>
        )}
        <div className={cn('grid gap-2 border-t border-white/8 p-4', mode !== 'content' && 'hidden')}>
          {(['hero', 'spotlight', 'story', 'event', 'cta'] as NewsletterSectionType[]).map((type) => (
            <button
              key={type}
              type="button"
              className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2.5 text-left text-xs text-zinc-300 transition-colors hover:border-[#7350FF]/40 hover:bg-white/[0.05]"
              onClick={() => addSection(type)}
            >
              <Plus className="size-3.5 shrink-0 text-[#7350FF]" />
              Add {SECTION_LABELS[type]}
            </button>
          ))}
        </div>
      </aside>

      {/* Editor */}
      <section className={cn(panelClass, 'flex min-h-0 flex-col overflow-hidden')}>
        <div className="flex items-start justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div>
            {mode === 'style' ? (
              <>
                <div className="text-sm font-semibold text-white">Global style</div>
                <p className="mt-1 text-xs leading-relaxed text-zinc-500">Colors, fonts, and spacing for the whole email.</p>
              </>
            ) : (
              <>
                <div className="text-sm font-semibold text-white">{selected ? SECTION_LABELS[selected.type] : 'Section editor'}</div>
                {selected && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{SECTION_DESCRIPTIONS[selected.type]}</p>}
              </>
            )}
          </div>
          {onSave && (
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#7350FF] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#8466ff] disabled:opacity-50"
            >
              <Save className="size-4" />
              {saving ? 'Saving…' : saveLabel}
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {mode === 'style' ? (
            <GlobalStylePanel doc={value} onChange={onChange} />
          ) : (
            <div className="grid gap-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <Field label="Campaign subject" value={value.subject || ''} onChange={(subject) => onChange({ ...value, subject })} />
                <Field label="Preview text" value={value.previewText || ''} onChange={(previewText) => onChange({ ...value, previewText })} />
              </div>
              <label className="block">
                <span className={labelClass}>Visual theme</span>
                <select
                  className={inputClass}
                  value={value.theme}
                  onChange={(e) => onChange({ ...value, theme: e.target.value as NewsletterThemeId })}
                >
                  <option value="ancNewsletter">ANC Newsletter (Media & Partnerships)</option>
                  <option value="ancSponsorMedia">ANC Sponsor Media (DealDeck gold)</option>
                </select>
              </label>
              {selected ? (
                <>
                  <SectionFields section={selected} onPatch={(patch) => patchSection(selected.id, patch)} />
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-rose-500/25 px-4 py-2.5 text-sm text-rose-300 transition-colors hover:bg-rose-500/10"
                    onClick={() => removeSection(selected.id)}
                  >
                    <Trash2 className="size-4" />
                    Remove section
                  </button>
                </>
              ) : (
                <p className="text-sm text-zinc-500">Add a section to start building.</p>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Preview — takes all remaining width */}
      <aside className={cn(panelClass, 'flex min-h-0 min-w-0 flex-col overflow-hidden')}>
        <div className="flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <Eye className="size-4 text-[#7350FF]" />
            Live preview
          </div>
          <div className="flex rounded-xl border border-white/10 bg-[#141824] p-1">
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                previewMode === 'desktop' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300',
              )}
              onClick={() => setPreviewMode('desktop')}
            >
              <Monitor className="size-3.5" />
              Inbox
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                previewMode === 'mobile' ? 'bg-white/10 text-white' : 'text-zinc-500 hover:text-zinc-300',
              )}
              onClick={() => setPreviewMode('mobile')}
            >
              <MonitorSmartphone className="size-3.5" />
              Mobile
            </button>
          </div>
        </div>

        <div className="border-b border-white/8 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Subject line</div>
          <div className="mt-1 text-base font-medium text-white">{value.subject || 'Untitled campaign'}</div>
          {value.previewText && <div className="mt-1 text-sm text-zinc-400">{value.previewText}</div>}
        </div>

        <div className="min-h-0 flex-1 overflow-auto bg-[radial-gradient(circle_at_top,#1a2140_0%,#0d1018_42%,#0a0b10_100%)] p-6 md:p-8">
          <div className="flex min-h-full items-start justify-center">
            <div
              className={cn(
                'w-full overflow-hidden rounded-2xl border border-white/10 bg-white shadow-[0_30px_100px_rgba(0,0,0,0.45)] transition-all',
                previewMode === 'mobile' ? 'max-w-[390px]' : 'max-w-[680px]',
              )}
            >
              <div
                className="border-b px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: resolvedStyle.navy, background: resolvedStyle.backgroundColor }}
              >
                ANC Sports · Media & Partnerships
              </div>
              <iframe
                title="Newsletter preview"
                srcDoc={previewHtml}
                className={cn('w-full border-0 bg-white', previewMode === 'mobile' ? 'h-[760px]' : 'h-[min(920px,calc(100vh-16rem))]')}
              />
            </div>
          </div>
        </div>

        {/* Send a test */}
        <div className="border-t border-white/8 px-5 py-4">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
            <Send className="size-3.5 text-[#7350FF]" />
            Send a test
          </div>
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="email"
              value={testEmail}
              placeholder="you@ancsports.net"
              onChange={(e) => {
                setTestEmail(e.target.value)
                if (testSend.status !== 'idle' && testSend.status !== 'sending') setTestSend({ status: 'idle' })
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && testSend.status !== 'sending') sendTest()
              }}
              className={cn(inputClass, 'sm:flex-1')}
            />
            <button
              type="button"
              onClick={sendTest}
              disabled={testSend.status === 'sending'}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#7350FF] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#8466ff] disabled:opacity-50"
            >
              <Send className="size-4" />
              {testSend.status === 'sending' ? 'Sending…' : 'Send test'}
            </button>
          </div>
          {testSend.message && (
            <p
              className={cn(
                'mt-2 text-xs leading-relaxed',
                testSend.status === 'sent' ? 'text-emerald-400' : testSend.status === 'error' ? 'text-rose-400' : 'text-zinc-500',
              )}
            >
              {testSend.message}
            </p>
          )}
        </div>
      </aside>
    </div>
  )
}
