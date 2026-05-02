import { mimoTts } from './mimo'
import { elevenlabsTts } from './elevenlabs'
import { openaiTts } from './openai'
import { geminiTts } from './gemini'
import type { TtsProvider } from './types'

const PROVIDERS: Record<string, TtsProvider> = {
  mimo: mimoTts,
  elevenlabs: elevenlabsTts,
  openai: openaiTts,
  gemini: geminiTts,
}

const DEFAULT_PROVIDER = (process.env.VOICE_TTS_PROVIDER || 'mimo').toLowerCase()

export function listTtsProviders(): TtsProvider[] {
  return Object.values(PROVIDERS)
}

export function getTtsProvider(name?: string | null): TtsProvider {
  const which = (name || DEFAULT_PROVIDER).toLowerCase()
  return PROVIDERS[which] || PROVIDERS[DEFAULT_PROVIDER] || mimoTts
}

export { TtsError } from './types'
export type { TtsProvider, TtsRequest, TtsResult } from './types'
