import { TtsError, type TtsProvider, type TtsRequest, type TtsResult } from './types'

/**
 * MiMo (Xiaomi) TTS — OpenAI-compatible auth, but TTS goes through
 * /v1/chat/completions with the text as an ASSISTANT message and audio
 * returned as base64 in choices[0].message.audio.data. Confirmed against
 * the live endpoint 2026-05-02.
 */

const BASE = process.env.MIMO_BASE_URL || 'https://token-plan-sgp.xiaomimimo.com/v1'
const API_KEY = process.env.MIMO_API_KEY || ''
const DEFAULT_MODEL = process.env.MIMO_TTS_MODEL || 'mimo-v2.5-tts'
const DEFAULT_VOICE = process.env.MIMO_TTS_VOICE || 'mimo_default'

const VOICES = ['mimo_default', 'Mia', 'Chloe', 'Milo', 'Dean', '冰糖', '茉莉', '苏打', '白桦'] as const

export const mimoTts: TtsProvider = {
  name: 'mimo',
  defaultVoice: DEFAULT_VOICE,
  defaultModel: DEFAULT_MODEL,

  listVoices() {
    return VOICES
  },

  isConfigured() {
    return !!API_KEY
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    if (!API_KEY) {
      throw new TtsError('mimo_api_key_not_configured', 503)
    }
    const text = (req.text || '').trim()
    if (!text) throw new TtsError('text_required', 400)
    const trimmed = text.length > 4000 ? text.slice(0, 4000) : text

    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: req.model || DEFAULT_MODEL,
        messages: [{ role: 'assistant', content: trimmed }],
        audio: { voice: req.voice || DEFAULT_VOICE },
      }),
      signal: AbortSignal.timeout(45000),
    })

    if (!res.ok) {
      const detail = await res.text()
      throw new TtsError('mimo_tts_failed', 502, detail.slice(0, 300))
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { audio?: { data?: string; format?: string } } }>
    }
    const audio = data.choices?.[0]?.message?.audio
    if (!audio?.data) throw new TtsError('no_audio_returned', 502)

    const bytes = new Uint8Array(Buffer.from(audio.data, 'base64'))
    const fmt = (audio.format || 'wav').toLowerCase()
    const contentType = fmt === 'mp3' ? 'audio/mpeg' : fmt === 'opus' ? 'audio/ogg' : 'audio/wav'
    return { bytes, contentType, format: fmt }
  },
}
