import { TtsError, type TtsProvider, type TtsRequest, type TtsResult } from './types'

/**
 * OpenAI TTS — slot reserved for swap-in.
 *   Set OPENAI_API_KEY (and optionally OPENAI_BASE_URL for compat gateways).
 *   Uses POST /v1/audio/speech, returns mp3 bytes.
 */

const BASE = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const API_KEY = process.env.OPENAI_API_KEY || ''
const DEFAULT_MODEL = process.env.OPENAI_TTS_MODEL || 'tts-1-hd'
const DEFAULT_VOICE = process.env.OPENAI_TTS_VOICE || 'alloy'
const VOICES = ['alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer'] as const

export const openaiTts: TtsProvider = {
  name: 'openai',
  defaultVoice: DEFAULT_VOICE,
  defaultModel: DEFAULT_MODEL,

  listVoices() {
    return VOICES
  },

  isConfigured() {
    return !!API_KEY
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    if (!API_KEY) throw new TtsError('openai_api_key_not_configured', 503)
    const text = (req.text || '').trim()
    if (!text) throw new TtsError('text_required', 400)

    const res = await fetch(`${BASE}/audio/speech`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: req.model || DEFAULT_MODEL,
        input: text.length > 4000 ? text.slice(0, 4000) : text,
        voice: req.voice || DEFAULT_VOICE,
        response_format: 'mp3',
      }),
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new TtsError('openai_tts_failed', 502, detail.slice(0, 300))
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { bytes, contentType: 'audio/mpeg', format: 'mp3' }
  },
}
