// Server-side client for the Browserless container running on EasyPanel
// (service: abc / browserless, image ghcr.io/browserless/chromium:latest).
// Internal-only — never expose BROWSERLESS_TOKEN to the browser.
//
// Configure via env on the EasyPanel anc-services service:
//   BROWSERLESS_INTERNAL_URL=http://abc_browserless:3000
//   BROWSERLESS_TOKEN=<TOKEN env from the browserless service>
//
// We default the URL to the in-cluster name so it works in production
// without DNS / port-forward overhead. Outside the cluster (local dev)
// override BROWSERLESS_INTERNAL_URL to a tunneled URL.

const DEFAULT_BASE = 'http://abc_browserless:3000'

export class BrowserlessError extends Error {
  status?: number
  bodyPreview?: string
  constructor(message: string, status?: number, bodyPreview?: string) {
    super(message)
    this.status = status
    this.bodyPreview = bodyPreview
  }
}

function baseUrl(): string {
  return (process.env.BROWSERLESS_INTERNAL_URL || DEFAULT_BASE).replace(/\/+$/, '')
}
function token(): string {
  const t = process.env.BROWSERLESS_TOKEN || ''
  if (!t) throw new BrowserlessError('BROWSERLESS_TOKEN is not configured on the server.')
  return t
}

export interface RenderPdfOptions {
  html: string
  // Browserless PDF options forwarded as-is — see
  // https://docs.browserless.io/chromium/pdf
  // Common: format ('Letter'|'A4'|'Legal'), landscape, scale, printBackground,
  // displayHeaderFooter, headerTemplate, footerTemplate, margin{top|right|bottom|left}.
  options?: Record<string, unknown>
  // Optional setExtraHTTPHeaders for any external resources fetched during
  // render (e.g. images on a private CDN). Rarely needed.
  extraHeaders?: Record<string, string>
}

export const Browserless = {
  configured(): boolean { return !!process.env.BROWSERLESS_TOKEN },

  // Renders an HTML string to a PDF and returns the binary Buffer.
  async renderPdf(opts: RenderPdfOptions): Promise<Buffer> {
    const url = `${baseUrl()}/pdf?token=${encodeURIComponent(token())}`
    const body: Record<string, unknown> = {
      html: opts.html,
    }
    if (opts.options) body.options = opts.options
    if (opts.extraHeaders) body.setExtraHTTPHeaders = opts.extraHeaders
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      // PDF render can take 5-15s on large docs.
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      const preview = await res.text().then((t) => t.slice(0, 300)).catch(() => '')
      throw new BrowserlessError(
        `Browserless PDF render failed (${res.status}): ${preview}`,
        res.status,
        preview,
      )
    }
    const arr = await res.arrayBuffer()
    return Buffer.from(arr)
  },

  // Navigates Chromium to a URL, waits for the page's JS to settle, and
  // returns the fully rendered HTML. Used by feed discovery for venue
  // sites that 403/406 plain server-side fetches or render their event
  // calendars client-side.
  async fetchContent(url: string, opts?: { waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'; timeoutMs?: number }): Promise<string> {
    const timeoutMs = opts?.timeoutMs ?? 45_000
    const endpoint = `${baseUrl()}/content?token=${encodeURIComponent(token())}`
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        gotoOptions: { waitUntil: opts?.waitUntil ?? 'networkidle2', timeout: timeoutMs },
      }),
      signal: AbortSignal.timeout(timeoutMs + 15_000),
    })
    if (!res.ok) {
      const preview = await res.text().then((t) => t.slice(0, 300)).catch(() => '')
      throw new BrowserlessError(
        `Browserless content render failed (${res.status}): ${preview}`,
        res.status,
        preview,
      )
    }
    return res.text()
  },
}
