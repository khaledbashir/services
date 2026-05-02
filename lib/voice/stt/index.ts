/**
 * Currently STT runs in-browser via Web Speech API (zero cost, zero latency).
 *
 * When you decide to move STT server-side — say MiMo Omni, OpenAI Whisper,
 * Deepgram, or AssemblyAI — drop a `<provider>.ts` file here implementing
 * SttProvider, then register it in the PROVIDERS map below. The frontend
 * needs to switch from SpeechRecognition to MediaRecorder + a fetch upload
 * to /api/internal/voice-agent/stt; everything else stays the same.
 *
 * Selector pattern is identical to lib/voice/tts so swaps are uniform.
 */

import type { SttProvider } from './types'

const PROVIDERS: Record<string, SttProvider> = {
  // 'whisper': whisperStt,
  // 'deepgram': deepgramStt,
  // 'mimo': mimoSttOmni,
}

const DEFAULT_PROVIDER = (process.env.VOICE_STT_PROVIDER || '').toLowerCase()

export function getSttProvider(name?: string | null): SttProvider | null {
  const which = (name || DEFAULT_PROVIDER).toLowerCase()
  return PROVIDERS[which] || null
}

export function listSttProviders(): SttProvider[] {
  return Object.values(PROVIDERS)
}

export { SttError } from './types'
export type { SttProvider, SttRequest, SttResult } from './types'
