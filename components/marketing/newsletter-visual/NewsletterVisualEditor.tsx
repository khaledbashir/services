'use client'

import { cn } from '@/lib/utils'
import {
  createSection,
  exportNewsletterFullHtml,
  getNewsletterTheme,
  SECTION_DESCRIPTIONS,
  SECTION_LABELS,
  type NewsletterSection,
  type NewsletterSectionType,
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
  Plus,
  Save,
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

export function NewsletterVisualEditor({ value, onChange, onSave, saving, saveLabel = 'Save newsletter' }: Props) {
  const [selectedId, setSelectedId] = useState<string>(value.sections[0]?.id || '')
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop')

  const selected = value.sections.find((section) => section.id === selectedId) || value.sections[0]
  const previewHtml = useMemo(() => exportNewsletterFullHtml(value, { preview: true }), [value])
  const theme = getNewsletterTheme(value.theme)

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
        <div className="border-b border-white/8 px-5 py-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <LayoutTemplate className="size-4 text-[#7350FF]" />
            Sections
          </div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">Build the newsletter as stacked blocks.</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto divide-y divide-white/6">
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
        <div className="grid gap-2 border-t border-white/8 p-4">
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
            <div className="text-sm font-semibold text-white">{selected ? SECTION_LABELS[selected.type] : 'Section editor'}</div>
            {selected && <p className="mt-1 text-xs leading-relaxed text-zinc-500">{SECTION_DESCRIPTIONS[selected.type]}</p>}
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
                style={{ color: theme.colors.navy, background: theme.colors.background }}
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
      </aside>
    </div>
  )
}
