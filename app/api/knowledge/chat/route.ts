import { NextRequest, NextResponse } from 'next/server'

const ANYTHINGLLM_URL = 'https://ancservices-anything-llm.izcgmb.easypanel.host/api/v1'
const ANYTHINGLLM_KEY = 'XGDBZ5Q-90R4117-NZJG7WZ-ZK693NP'

// Internal knowledge base uses a dedicated workspace
// Falls back through multiple workspace slugs
const WORKSPACES = ['anc-internal', 'anc-knowledge', 'fenway-park']

export async function POST(request: NextRequest) {
  try {
    const { message, mode } = await request.json()
    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    const chatMode = mode || 'chat'

    // Try each workspace until one works
    for (const slug of WORKSPACES) {
      try {
        const res = await fetch(`${ANYTHINGLLM_URL}/workspace/${slug}/chat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${ANYTHINGLLM_KEY}`,
          },
          body: JSON.stringify({ message, mode: chatMode }),
        })

        if (res.ok) {
          const data = await res.json()
          let content = data.textResponse || data.text || ''
          content = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
          return NextResponse.json({
            response: content,
            sources: data.sources || [],
            workspace: slug,
          })
        }
      } catch {}
    }

    return NextResponse.json({
      response: "The knowledge base is being set up. Once your team uploads documents and SOPs, I'll be able to answer any question about ANC operations, products, and procedures.",
    })
  } catch (err) {
    console.error('Knowledge chat error:', err)
    return NextResponse.json({
      response: "Something went wrong. Please try again.",
    })
  }
}
