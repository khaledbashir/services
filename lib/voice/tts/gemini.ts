import { TtsError, type TtsProvider, type TtsRequest, type TtsResult } from './types'

/**
 * Google Gemini TTS — slot reserved for swap-in.
 *   Set GEMINI_API_KEY (or GOOGLE_API_KEY).
 *   Uses /v1beta/models/<model>:generateContent with responseModalities: AUDIO.
 *   Returns 24kHz PCM that we wrap in a WAV header.
 */

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
const DEFAULT_MODEL = process.env.GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview'
const DEFAULT_VOICE = process.env.GEMINI_TTS_VOICE || 'Charon'

function pcmToWav(pcm: Buffer, sampleRate = 24000, channels = 1, bitsPerSample = 16): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8
  const blockAlign = (channels * bitsPerSample) / 8
  const dataSize = pcm.length
  const buf = Buffer.alloc(44 + dataSize)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataSize, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(channels, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(byteRate, 28)
  buf.writeUInt16LE(blockAlign, 32)
  buf.writeUInt16LE(bitsPerSample, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataSize, 40)
  pcm.copy(buf, 44)
  return buf
}

function rateFromMime(mime: string): number {
  const m = /rate=(\d+)/i.exec(mime || '')
  return m ? parseInt(m[1], 10) : 24000
}

export const geminiTts: TtsProvider = {
  name: 'gemini',
  defaultVoice: DEFAULT_VOICE,
  defaultModel: DEFAULT_MODEL,

  listVoices() {
    return ['Charon', 'Aoede', 'Fenrir', 'Kore', 'Orus', 'Puck']
  },

  isConfigured() {
    return !!API_KEY
  },

  async synthesize(req: TtsRequest): Promise<TtsResult> {
    if (!API_KEY) throw new TtsError('gemini_api_key_not_configured', 503)
    const text = (req.text || '').trim()
    if (!text) throw new TtsError('text_required', 400)

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(req.model || DEFAULT_MODEL)}:generateContent?key=${API_KEY}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: text.length > 4000 ? text.slice(0, 4000) : text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: req.voice || DEFAULT_VOICE } } },
        },
      }),
      signal: AbortSignal.timeout(30000),
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new TtsError('gemini_tts_failed', 502, detail.slice(0, 300))
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }>
    }
    const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData?.data)
    const inline = part?.inlineData
    if (!inline?.data) throw new TtsError('no_audio_returned', 502)
    const pcm = Buffer.from(inline.data, 'base64')
    const sampleRate = rateFromMime(inline.mimeType || '')
    const wav = pcmToWav(pcm, sampleRate)
    return { bytes: new Uint8Array(wav), contentType: 'audio/wav', format: 'wav', sampleRate }
  },
}
