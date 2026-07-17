type EnvLike = Record<string, string | undefined>

function splitKeyPool(value: string | undefined): string[] {
  return (value || '')
    .split(/[\s,;]+/)
    .map((key) => key.trim())
    .filter(Boolean)
}

/**
 * Return every configured Gemini credential in deterministic failover order.
 *
 * GEMINI_API_KEY remains first for backwards compatibility. Additional keys
 * can be supplied as a comma/newline-separated GEMINI_API_KEYS pool or as
 * numbered GEMINI_API_KEY_2, GEMINI_API_KEY_3, ... variables. GOOGLE_API_KEY
 * is accepted last for services that already use Google's conventional name.
 */
export function getGeminiApiKeys(env: EnvLike = process.env): string[] {
  const numberedKeys = Object.keys(env)
    .map((name) => {
      const match = name.match(/^GEMINI_API_KEY_(\d+)$/)
      return match ? { name, order: Number(match[1]) } : null
    })
    .filter((item): item is { name: string; order: number } => item !== null)
    .sort((left, right) => left.order - right.order)
    .map(({ name }) => env[name] || '')

  const candidates = [
    env.GEMINI_API_KEY || '',
    ...splitKeyPool(env.GEMINI_API_KEYS),
    ...numberedKeys,
    env.GOOGLE_API_KEY || '',
  ]

  return [...new Set(candidates.map((key) => key.trim()).filter(Boolean))]
}
