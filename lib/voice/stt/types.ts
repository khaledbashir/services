/**
 * Provider-agnostic STT (speech-to-text) interface.
 *
 * Today the voice agent uses the browser's Web Speech API for free STT —
 * no provider call needed. This file exists so a server-side provider
 * (Whisper, Deepgram, AssemblyAI, MiMo Omni, etc.) can drop in later
 * without touching route handlers.
 *
 * Adding a server-side provider later:
 *   1. Create lib/voice/stt/<name>.ts implementing SttProvider.
 *   2. Register in lib/voice/stt/index.ts.
 *   3. Build /api/internal/voice-agent/stt that uploads audio bytes
 *      from MediaRecorder and calls getSttProvider().transcribe().
 */

export interface SttRequest {
  audio: Uint8Array
  /** MIME type of the uploaded audio, e.g. 'audio/webm' or 'audio/wav'. */
  mimeType: string
  /** ISO language tag, defaults to 'en-US'. */
  language?: string
  /** Provider-specific model override. */
  model?: string
}

export interface SttResult {
  text: string
  /** Confidence 0-1, when the provider supplies one. */
  confidence?: number
  /** Detected language, when supplied. */
  language?: string
}

export interface SttProvider {
  readonly name: string
  readonly defaultModel: string
  isConfigured(): boolean
  transcribe(req: SttRequest): Promise<SttResult>
}

export class SttError extends Error {
  status: number
  detail?: string
  constructor(message: string, status = 500, detail?: string) {
    super(message)
    this.status = status
    this.detail = detail
  }
}
