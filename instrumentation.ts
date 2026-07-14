/**
 * Next.js boot hook (runs once per server process). Kicks off the proof file
 * cache warmer so a fresh deploy doesn't serve its first proofs cold.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { warmProofCacheOnBoot } = await import('@/lib/proof-cache-warmer')
    warmProofCacheOnBoot()
  }
}
