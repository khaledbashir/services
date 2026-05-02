'use client'

import { useEffect, useState } from 'react'
import { VoiceCallWidget } from '@/components/voice-call-widget'

interface VoiceAgent {
  id: string
  slug: string
  name: string
  greeting: string | null
  isActive: boolean
}

export default function VoiceAgentEmbedPage({ params }: { params: { id: string } }) {
  const [agent, setAgent] = useState<VoiceAgent | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/voice-agents/${params.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setAgent(data.agent)
        else setError(data.error || 'Failed to load agent')
      })
      .catch(err => setError(String(err)))
  }, [params.id])

  if (error) {
    return (
      <main className="flex h-screen w-full items-center justify-center bg-white p-4 text-sm text-rose-600">
        {error}
      </main>
    )
  }

  if (!agent) {
    return (
      <main className="flex h-screen w-full items-center justify-center bg-white p-4 text-sm text-zinc-500">
        Loading…
      </main>
    )
  }

  return (
    <main className="h-screen w-full bg-white">
      <VoiceCallWidget
        agentRef={agent.slug}
        agentName={agent.name}
        greeting={agent.greeting}
        compact
        showTextFallback={false}
      />
    </main>
  )
}
