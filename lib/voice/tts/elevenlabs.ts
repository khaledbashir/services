import { TtsError, type TtsProvider, type TtsRequest, type TtsResult } from './types'

/**
 * ElevenLabs TTS — slot reserved for swap-in. Wire it up by:
 *   1. Set ELEVENLABS_API_KEY in env.
 *   2. Set VOICE_TTS_PROVIDER=elevenlabs (or pick per-agent).
 *   3. Optionally override ELEVENLABS_TTS_MODEL / ELEVENLABS_TTS_VOICE.
 *
 * Implementation reference (ElevenLabs REST):
 *   POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
 *   Headers: xi-api-key, Content-Type: application/json
 *   Body: { text, model_id, voice_settings: { stability, similarity_boost } }
 *   Response: audio/mpeg bytes (mp3).
 */

const API_KEY = process.env.ELEVENLABS_API_KEY || ''
const DEFAULT_MODEL = process.env.ELEVENLABS_TTS_MODEL || 'eleven_turbo_v2_5'
const DEFAULT_VOICE = process.env.ELEVENLABS_TTS_VOICE || 'JBFqnCBsd6RMkjVDRZzb' // Rachel

export const elevenlabsTts: TtsProvider = {
  name: 'elevenlabs',
  defaultVoice: DEFAULT_VOICE,
  defaultModel: DEFAULT_MODEL,

  listVoices() {
    return [DEFAULT_VOICE]
  },

  isConfigured() {
    return !!API_KEY
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    if (!API_KEY) throw new TtsError('elevenlabs_api_key_not_configured', 503)
    const text = (req.text || '').trim()
    if (!text) throw new TtsError('text_required', 400)
    const voice = req.voice || DEFAULT_VOICE

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}`, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text: text.length > 4000 ? text.slice(0, 4000) : text,
        model_id: req.model || DEFAULT_MODEL,
      }),
      signal: AbortSignal.timeout(45000),
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new TtsError('elevenlabs_tts_failed', 502, detail.slice(0, 300))
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    return { bytes, contentType: 'audio/mpeg', format: 'mp3' }
  },
}
