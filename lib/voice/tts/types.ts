/**
 * Provider-agnostic TTS interface.
 *
 * Adding a new provider:
 *   1. Create lib/voice/tts/<name>.ts that exports a `TtsProvider`.
 *   2. Register it in lib/voice/tts/index.ts.
 *   3. Done — switch by setting VOICE_TTS_PROVIDER=<name> in env, or by
 *      passing { provider: '<name>' } per-call.
 *
 * Each route handler / per-agent record stays untouched on a provider swap.
 */

export interface TtsRequest {
  text: string
  /** Provider-specific voice id (e.g. MiMo's "Dean", ElevenLabs voice UUID). */
  voice?: string
  /** Provider-specific model override (e.g. "mimo-v2.5-tts"). */
  model?: string
}

export interface TtsResult {
  /** Raw audio bytes ready to stream to the browser. */
  bytes: Uint8Array
  /** HTTP Content-Type to set on the response. */
  contentType: string
  /** Short format token: 'wav' | 'mp3' | 'opus' | 'ogg' | 'pcm'. */
  format: string
  /** Sample rate in Hz, when known. Optional — clients shouldn't depend on it. */
  sampleRate?: number
}

export interface TtsProvider {
  /** Stable provider identifier — matches the env value used to select it. */
  readonly name: string
  /** Default voice id this provider falls back to. */
  readonly defaultVoice: string
  /** Default model id this provider falls back to. */
  readonly defaultModel: string
  /** Voice ids known to be valid. UI uses this for the picker. */
  listVoices(): readonly string[]
  /** Returns true when configuration (api keys etc.) is present. */
  isConfigured(): boolean
  /** Synthesize speech. Throws on provider error. */
  synthesize(req: TtsRequest): Promise<TtsResult>
}

export class TtsError extends Error {
  status: number
  detail?: string
  constructor(message: string, status = 500, detail?: string) {
    super(message)
    this.status = status
    this.detail = detail
  }
}
