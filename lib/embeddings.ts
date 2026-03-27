const EMBED_MODEL = 'gemini-embedding-2-preview'

function getEmbedUrl() {
  const key = process.env.GEMINI_API_KEY || ''
  if (!key) throw new Error('GEMINI_API_KEY not set')
  return `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${key}`
}

export async function getTextEmbedding(text: string): Promise<number[]> {
  const res = await fetch(getEmbedUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`[embedding] Gemini API ${res.status}: ${body}`)
    throw new Error(`Embedding API error: ${res.status} — ${body.substring(0, 200)}`)
  }
  const data = await res.json()
  return data.embedding.values
}

export async function getImageEmbedding(base64Data: string, mimeType: string): Promise<number[]> {
  // Strip data URL prefix if present
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data

  const res = await fetch(getEmbedUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: {
        parts: [{
          inline_data: { mime_type: mimeType, data: raw },
        }],
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`[embedding] Gemini API ${res.status}: ${body}`)
    throw new Error(`Embedding API error: ${res.status} — ${body.substring(0, 200)}`)
  }
  const data = await res.json()
  return data.embedding.values
}

export async function getMultimodalEmbedding(text: string, base64Data: string, mimeType: string): Promise<number[]> {
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data

  const res = await fetch(getEmbedUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: {
        parts: [
          { text },
          { inline_data: { mime_type: mimeType, data: raw } },
        ],
      },
    }),
  })
  if (!res.ok) {
    const body = await res.text()
    console.error(`[embedding] Gemini API ${res.status}: ${body}`)
    throw new Error(`Embedding API error: ${res.status} — ${body.substring(0, 200)}`)
  }
  const data = await res.json()
  return data.embedding.values
}
