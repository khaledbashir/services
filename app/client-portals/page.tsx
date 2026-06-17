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
  const visualLanes = [
    {
      label: 'Client portal',
      href: '/client-portals?start=service-portal',
      body: 'Service, project, post-install, and account-facing workspaces.',
      active: startRecipe === 'service-portal',
    },
    {
      label: 'Presentation deck',
      href: '/client-portals?start=sales-proposal',
      body: 'Sales story, proof, pricing, scope, and executive close.',
      active: startRecipe === 'sales-proposal',
    },
    {
      label: 'Marketing campaign',
      href: '/marketing-hub/studio',
      body: 'Newsletter render, social copy, audience context, and approval staging.',
      active: false,
    },
    {
      label: 'Venue Vision 3D',
      href: '/venue-vision',
      body: 'Interactive venue model for proposed display layouts, approvals, asset maps, and issue intake.',
      active: false,
    },
    {
      label: 'QBR report',
      href: '/client-portals?start=renewal-qbr',
      body: 'Service health, trends, completed work, open risks, and renewal proof.',
      active: startRecipe === 'renewal-qbr',
    },
  ]

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
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,0.55fr)]">
            <div className="p-6 sm:p-7">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#0A52EF]">
                  <img src="/ANC_Logo_2023_white.png" alt="ANC" className="h-5 w-auto" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#0A52EF] dark:text-[#60A5FA]">Visual Output Studio</p>
                  <h1 className="mt-1 text-2xl font-semibold text-zinc-950 dark:text-white">Client-facing builds</h1>
                </div>
              </div>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                This is the workspace for visual things ANC needs to show, review, publish, or send. Client portals are one lane; presentations, venue vision models, marketing campaigns, reports, and approvals use the same studio model.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void create('service-portal')}
                  disabled={creating}
                  className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0A52EF] px-4 text-sm font-semibold text-white transition hover:bg-[#0840C0] disabled:opacity-60"
                >
                  {creating ? 'Creating...' : '+ New client portal'}
                </button>
                <Link
                  href="/presentation/new"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-[#0A52EF]/35 hover:text-[#0A52EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-[#60A5FA]/45"
                >
                  Studio home
                </Link>
                <Link
                  href="/marketing-hub/studio"
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-zinc-200 bg-white px-4 text-sm font-semibold text-zinc-700 transition hover:border-[#0A52EF]/35 hover:text-[#0A52EF] dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:border-[#60A5FA]/45"
                >
                  Marketing agent
                </Link>
              </div>
            </div>
            <div className="border-t border-zinc-200 bg-zinc-50 p-5 dark:border-zinc-800 dark:bg-zinc-900/70 lg:border-l lg:border-t-0">
              <div className="grid gap-2">
                {visualLanes.map((lane) => (
                  <Link
                    key={lane.label}
                    href={lane.href}
                    className={`rounded-lg border p-3 text-left transition ${
                      lane.active
                        ? 'border-[#0A52EF]/40 bg-[#0A52EF]/5 dark:border-[#60A5FA]/40 dark:bg-[#60A5FA]/10'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-sm font-semibold text-zinc-950 dark:text-white">{lane.label}</div>
                    <div className="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{lane.body}</div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#0A52EF] dark:text-[#60A5FA]">Portal presets</p>
              <h2 className="mt-1 text-xl font-semibold text-zinc-950 dark:text-white">What client-facing shell do we need?</h2>
              <p className="mt-1 max-w-2xl text-sm text-zinc-500 dark:text-zinc-400">{selectedRecipe.tagline}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PORTAL_RECIPES.map((recipe) => (
                  <button
                    key={recipe.id}
                    type="button"
                    onClick={() => setStartRecipe(recipe.id)}
                    className={`rounded-xl border px-3 py-3 text-left transition ${
                      startRecipe === recipe.id
                        ? 'border-[#0A52EF] bg-[#0A52EF]/5 text-zinc-950 shadow-sm dark:border-[#60A5FA] dark:bg-[#60A5FA]/10 dark:text-white'
                        : 'border-zinc-200 bg-zinc-50 text-zinc-700 hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/80'
                    }`}
                  >
                    <div className="text-sm font-semibold">{recipe.label}</div>
                    <div className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">{recipe.tagline}</div>
                  </button>
                ))}
              </div>
            </div>
            <form
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900 xl:w-[340px]"
              onSubmit={(event) => {
                event.preventDefault()
                void create()
              }}
            >
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300" htmlFor="portal-client-name">
                Client / venue name
              </label>
              <input
                id="portal-client-name"
                value={clientName}
                onChange={(event) => setClientName(event.target.value)}
                className="mt-2 h-10 w-full rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-[#0A52EF] focus:ring-2 focus:ring-[#0A52EF]/15 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
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
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No visual client builds yet. Create one and watch it assemble live.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)_minmax(0,0.5fr)_auto] gap-4 border-b border-zinc-200 bg-zinc-50 px-6 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
              <div>Visual build</div>
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
                      <div className="font-semibold text-zinc-950 dark:text-white">{portal.title}</div>
                      <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        Created by {portal.created_by_email} · Updated {new Date(portal.updated_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="capitalize text-zinc-600 dark:text-zinc-300">{portal.recipe.replace(/-/g, ' ')}</div>
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
