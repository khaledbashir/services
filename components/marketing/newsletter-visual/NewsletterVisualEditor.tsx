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
  GripVertical,
  LayoutTemplate,
  MonitorSmartphone,
  Plus,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'

const inputClass =
  'w-full rounded-md border border-zinc-800 bg-zinc-950/70 px-3 py-2 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-[#7350FF] focus:ring-2 focus:ring-[#7350FF]/20'
const labelClass = 'mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500'

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
          className={`${inputClass} min-h-[96px]`}
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
        <div className="grid gap-3">
          <Field label="Eyebrow" value={section.eyebrow || ''} onChange={(eyebrow) => onPatch({ eyebrow })} />
          <Field label="Headline" value={section.headline || ''} onChange={(headline) => onPatch({ headline })} />
          <Field label="Intro" value={section.body || ''} onChange={(body) => onPatch({ body })} multiline />
          <Field label="Hero image URL" value={section.imageUrl || ''} onChange={(imageUrl) => onPatch({ imageUrl })} placeholder="https://..." />
          <Field label="Image alt text" value={section.imageAlt || ''} onChange={(imageAlt) => onPatch({ imageAlt })} />
        </div>
      )
    case 'spotlight':
      return (
        <div className="grid gap-3">
          <Field label="Label" value={section.eyebrow || ''} onChange={(eyebrow) => onPatch({ eyebrow })} />
          <Field label="Headline" value={section.headline || ''} onChange={(headline) => onPatch({ headline })} />
          <Field label="Body" value={section.body || ''} onChange={(body) => onPatch({ body })} multiline />
        </div>
      )
    case 'story':
      return (
        <div className="grid gap-3">
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
        <div className="grid gap-3">
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
        <div className="grid gap-3">
          <Field label="Headline" value={section.headline || ''} onChange={(headline) => onPatch({ headline })} />
          <Field label="Body" value={section.body || ''} onChange={(body) => onPatch({ body })} multiline />
          <Field label="Button label" value={section.ctaLabel || ''} onChange={(ctaLabel) => onPatch({ ctaLabel })} />
          <Field label="Button URL" value={section.ctaUrl || ''} onChange={(ctaUrl) => onPatch({ ctaUrl })} />
        </div>
      )
    case 'divider':
      return <p className="text-sm text-zinc-500">A simple divider line between content blocks.</p>
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
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)_360px]">
      <aside className="rounded-md border border-zinc-800 bg-zinc-950/70">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <LayoutTemplate className="size-4 text-[#7350FF]" />
            Sections
          </div>
          <p className="mt-1 text-xs text-zinc-500">DealDeck-style blocks for email layout</p>
        </div>
        <div className="divide-y divide-zinc-800">
          {value.sections.map((section, index) => (
            <div
              key={section.id}
              className={cn(
                'flex items-start gap-2 px-3 py-2.5 transition-colors',
                selected?.id === section.id ? 'bg-[#7350FF]/10' : 'hover:bg-zinc-900/70',
              )}
            >
              <button type="button" className="mt-1 text-zinc-600" onClick={() => setSelectedId(section.id)}>
                <GripVertical className="size-4" />
              </button>
              <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setSelectedId(section.id)}>
                <div className="text-sm font-medium text-zinc-100">{SECTION_LABELS[section.type]}</div>
                <div className="truncate text-xs text-zinc-500">{section.headline || section.eyebrow || `Block ${index + 1}`}</div>
              </button>
              <div className="flex flex-col gap-1">
                <button type="button" className="rounded border border-zinc-800 p-1 text-zinc-500 hover:text-zinc-200" onClick={() => moveSection(section.id, -1)}>
                  <ArrowUp className="size-3.5" />
                </button>
                <button type="button" className="rounded border border-zinc-800 p-1 text-zinc-500 hover:text-zinc-200" onClick={() => moveSection(section.id, 1)}>
                  <ArrowDown className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-2 border-t border-zinc-800 p-3">
          {(['hero', 'spotlight', 'story', 'event', 'cta', 'divider'] as NewsletterSectionType[]).map((type) => (
            <button
              key={type}
              type="button"
              className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-left text-xs text-zinc-300 hover:border-[#7350FF]/50 hover:bg-zinc-900"
              onClick={() => addSection(type)}
            >
              <Plus className="size-3.5 shrink-0 text-[#7350FF]" />
              Add {SECTION_LABELS[type]}
            </button>
          ))}
        </div>
      </aside>

      <section className="rounded-md border border-zinc-800 bg-zinc-950/70">
        <div className="border-b border-zinc-800 px-4 py-3">
          <div className="text-sm font-semibold text-zinc-100">{selected ? SECTION_LABELS[selected.type] : 'Section editor'}</div>
          {selected && <p className="mt-1 text-xs text-zinc-500">{SECTION_DESCRIPTIONS[selected.type]}</p>}
        </div>
        <div className="grid gap-4 p-4">
          <div className="grid gap-3 md:grid-cols-2">
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
                className="inline-flex items-center gap-2 rounded-md border border-rose-500/30 px-3 py-2 text-sm text-rose-300 hover:bg-rose-500/10"
                onClick={() => removeSection(selected.id)}
              >
                <Trash2 className="size-4" />
                Remove section
              </button>
            </>
          ) : (
            <p className="text-sm text-zinc-500">Add a section to start building.</p>
          )}
          {onSave && (
            <button
              type="button"
              disabled={saving}
              onClick={onSave}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-[#7350FF] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#8466ff] disabled:opacity-50"
            >
              {saving ? 'Saving…' : saveLabel}
            </button>
          )}
        </div>
      </section>

      <aside className="rounded-md border border-zinc-800 bg-zinc-950/70">
        <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100">
            <Eye className="size-4 text-[#7350FF]" />
            Live preview
          </div>
          <div className="flex rounded-md border border-zinc-800 p-0.5">
            <button
              type="button"
              className={cn('rounded px-2 py-1 text-xs', previewMode === 'desktop' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500')}
              onClick={() => setPreviewMode('desktop')}
            >
              Desktop
            </button>
            <button
              type="button"
              className={cn('rounded px-2 py-1 text-xs', previewMode === 'mobile' ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500')}
              onClick={() => setPreviewMode('mobile')}
            >
              <MonitorSmartphone className="size-3.5" />
            </button>
          </div>
        </div>
        <div className="p-4">
          <div className="mb-3 rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-xs text-zinc-500">
            <div className="font-semibold uppercase tracking-[0.12em] text-zinc-400">Subject</div>
            <div className="mt-1 text-sm text-zinc-200">{value.subject || 'Untitled campaign'}</div>
            {value.previewText && <div className="mt-1 text-zinc-500">{value.previewText}</div>}
          </div>
          <div
            className={cn(
              'mx-auto overflow-hidden rounded-md border border-zinc-800 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.35)] transition-all',
              previewMode === 'mobile' ? 'max-w-[320px]' : 'max-w-[600px]',
            )}
          >
            <div className="border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.14em]" style={{ color: theme.colors.navy, background: theme.colors.background }}>
              ANC visual composer
            </div>
            <iframe title="Newsletter preview" srcDoc={previewHtml} className="h-[720px] w-full border-0 bg-white" />
          </div>
        </div>
      </aside>
    </div>
  )
}
