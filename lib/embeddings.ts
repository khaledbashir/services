const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''
const EMBED_MODEL = 'gemini-embedding-2-preview'
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${GEMINI_API_KEY}`

export async function getTextEmbedding(text: string): Promise<number[]> {
  const res = await fetch(EMBED_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
    }),
  })
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`)
  const data = await res.json()
  return data.embedding.values
}

export async function getImageEmbedding(base64Data: string, mimeType: string): Promise<number[]> {
  // Strip data URL prefix if present
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data

  const res = await fetch(EMBED_URL, {
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
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`)
  const data = await res.json()
  return data.embedding.values
}

export async function getMultimodalEmbedding(text: string, base64Data: string, mimeType: string): Promise<number[]> {
  const raw = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data

  const res = await fetch(EMBED_URL, {
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
  if (!res.ok) throw new Error(`Embedding API error: ${res.status}`)
  const data = await res.json()
  return data.embedding.values
}
