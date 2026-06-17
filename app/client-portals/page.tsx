'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { DashboardLayout } from '@/components/dashboard-layout'
import { Skeleton } from '@/components/skeleton'
import { PORTAL_RECIPES } from '@/lib/proposal-portal/recipes'
import type { PortalRecipeId } from '@/lib/proposal-portal/types'
import { buildProposalPortalShareUrl } from '@/lib/proposal-portal/share-url'
import { useAuth } from '@/lib/useAuth'

type PortalRow = {
  id: string
  title: string
  mode: string
  recipe: string
  created_by_email: string
  is_public: boolean
  updated_at: string
  published_at: string | null
}

export default function ClientPortalsHubPage() {
  useAuth('manager')

  const [portals, setPortals] = useState<PortalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [startRecipe, setStartRecipe] = useState<PortalRecipeId>('service-portal')
  const [clientName, setClientName] = useState('New Client')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/proposal-portals')
      if (!res.ok) return
      const json = (await res.json()) as { portals: PortalRow[] }
      setPortals(json.portals || [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const value = new URLSearchParams(window.location.search).get('start')
    const match = PORTAL_RECIPES.find((recipe) => recipe.id === value)
    if (match) setStartRecipe(match.id)
  }, [])

  const selectedRecipe = PORTAL_RECIPES.find((recipe) => recipe.id === startRecipe) ?? PORTAL_RECIPES[1]

  const create = async (recipe: PortalRecipeId = startRecipe) => {
    const name = clientName.trim() || 'New Client'
    setCreating(true)
    try {
      const res = await fetch('/api/proposal-portals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: name,
          recipe,
          title: `${name} - ${PORTAL_RECIPES.find((r) => r.id === recipe)?.label ?? 'Client Portal'}`,
        }),
      })
      if (!res.ok) return
      const json = (await res.json()) as { id: string }
      window.location.href = `/client-portals/build?id=${json.id}`
    } finally {
      setCreating(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="rounded-2xl border border-[#D9E2F2] bg-gradient-to-br from-[#0A52EF] via-[#0A52EF] to-[#083BA8] p-6 text-white shadow-[0_24px_80px_-40px_rgba(10,82,239,0.9)]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">Client Experience</p>
          <h1 className="mt-2 text-2xl font-semibold">Client Portals</h1>
          <p className="mt-2 max-w-3xl text-sm text-blue-100">
            Build client-facing experiences with AI guidance, module toggles, a live preview, and publishable links.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void create('service-portal')}
              disabled={creating}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-[#0A52EF] transition hover:bg-blue-50 disabled:opacity-60"
            >
              {creating ? 'Creating...' : '+ New service portal'}
            </button>
            <Link
              href="/presentation/new"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/25 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Build Studio
            </Link>
            <Link
              href="/portals"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-white/25 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Venue health links (ops)
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A52EF]">Start a build</p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-950">What are we building?</h2>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500">{selectedRecipe.tagline}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PORTAL_RECIPES.map((recipe) => (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => setStartRecipe(recipe.id)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      startRecipe === recipe.id
                        ? 'border-[#0A52EF] bg-[#0A52EF]/5 text-zinc-950 shadow-sm'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white'
                    }`}
                  >
                    <div className="text-sm font-semibold">{recipe.label}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">{recipe.tagline}</div>
                  </button>
                ))}
              </div>
            </div>
            <form
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 xl:w-[340px]"
              onSubmit={(event) => {
                event.preventDefault()
                void create()
              }}
            >
              <label className="text-xs font-semibold text-zinc-600" htmlFor="portal-client-name">
                Client / venue name
              </label>
              <input
                id="portal-client-name"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15"
                placeholder="QA Test Arena"
              />
              <button
                type="submit"
                disabled={creating}
                className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-[#0840C0] disabled:opacity-60"
              >
                {creating ? 'Creating...' : `Build ${selectedRecipe.label}`}
              </button>
            </form>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-20 rounded-2xl" />
            ))}
          </div>
        ) : portals.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm">
            <p className="text-sm text-zinc-600">No proposal portals yet. Create one and watch it assemble live.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.5fr)_auto] gap-4 border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500">
              <div>Portal</div>
              <div>Preset</div>
              <div>Status</div>
              <div />
            </div>
            <div className="divide-y divide-zinc-200">
              {portals.map((portal) => {
                const shareUrl =
                  typeof window !== 'undefined'
                    ? buildProposalPortalShareUrl(window.location.origin, portal.id)
                    : `/client-portals/p/${portal.id}`
                return (
                  <div
                    key={portal.id}
                    className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.5fr)_auto] gap-4 px-6 py-4 text-sm"
                  >
                    <div>
                      <div className="font-semibold text-zinc-950">{portal.title}</div>
                      <div className="mt-1 text-xs text-zinc-400">
                        Created by {portal.created_by_email} · Updated {new Date(portal.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="capitalize text-zinc-600">{portal.recipe.replace(/-/g, ' ')}</div>
                    <div>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                          portal.is_public
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        {portal.is_public ? 'Live' : 'Draft'}
                      </span>
                    </div>
                    <div className="flex justify-end gap-2">
                      {portal.is_public && (
                        <a
                          href={shareUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center justify-center rounded-lg border border-zinc-200 px-3 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          Client link
                        </a>
                      )}
                      <Link
                        href={`/client-portals/build?id=${portal.id}`}
                        className="inline-flex h-9 items-center justify-center rounded-lg bg-[#0A52EF] px-3 text-xs font-semibold text-white hover:bg-[#0840C0]"
                      >
                        Edit
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}
