import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import sharp from 'sharp'
import * as gifencNs from 'gifenc'

// gifenc ships a CJS main and an ESM "module" build with different default-export
// shapes; resolve named exports from whichever namespace the bundler picked.
const gifencAny = gifencNs as Record<string, unknown> & { default?: Record<string, unknown> }
const GIFEncoder = (gifencAny.GIFEncoder ?? gifencAny.default?.GIFEncoder) as typeof import('gifenc').GIFEncoder
const quantize = (gifencAny.quantize ?? gifencAny.default?.quantize) as typeof import('gifenc').quantize
const applyPalette = (gifencAny.applyPalette ?? gifencAny.default?.applyPalette) as typeof import('gifenc').applyPalette

export type RenderedFile = {
  name: string
  mime: 'image/jpeg' | 'image/png' | 'image/gif'
  bytes: number
  withinCap: boolean
  dataUrl: string
}

export type RenderResult = {
  files: RenderedFile[]
  width: number
  height: number
  maxBytes: number
}

function browserWsEndpoint(): string {
  const base = (process.env.BROWSERLESS_URL || 'ws://abc_browserless:3000').replace(/\/$/, '')
  const token = process.env.BROWSERLESS_TOKEN || ''
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

async function connect(): Promise<Browser> {
  return puppeteer.connect({ browserWSEndpoint: browserWsEndpoint() })
}

async function loadPage(browser: Browser, html: string, width: number, height: number): Promise<Page> {
  const page = await browser.newPage()
  await page.setViewport({ width, height, deviceScaleFactor: 2 })
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 })
  await page.evaluate(() => (document as unknown as { fonts?: { ready: Promise<unknown> } }).fonts?.ready)
  return page
}

async function screenshot2x(page: Page, width: number, height: number): Promise<Buffer> {
  const raw = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width, height } })
  return Buffer.from(raw)
}

async function toJpegUnderCap(png2x: Buffer, width: number, height: number, maxBytes: number): Promise<Buffer> {
  let quality = 90
  let out = await sharp(png2x).resize(width, height, { kernel: 'lanczos3' }).jpeg({ quality, mozjpeg: true }).toBuffer()
  while (out.length > maxBytes && quality > 40) {
    quality -= 10
    out = await sharp(png2x).resize(width, height, { kernel: 'lanczos3' }).jpeg({ quality, mozjpeg: true }).toBuffer()
  }
  return out
}

async function toPng(png2x: Buffer, width: number, height: number, maxBytes: number): Promise<Buffer> {
  const full = await sharp(png2x).resize(width, height, { kernel: 'lanczos3' }).png().toBuffer()
  if (full.length <= maxBytes) return full
  return sharp(png2x).resize(width, height, { kernel: 'lanczos3' }).png({ palette: true, quality: 90 }).toBuffer()
}

/**
 * Assemble a looping GIF from per-frame PNG buffers (already at final size).
 * SBJ best practice: GIFs outperform static units. Kept subtle — a CTA pulse.
 */
async function framesToGif(
  frames: Buffer[],
  width: number,
  height: number,
  maxBytes: number
): Promise<Buffer | null> {
  for (const maxColors of [128, 64, 32]) {
    const gif = GIFEncoder()
    for (const frame of frames) {
      const { data } = await sharp(frame).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const rgba = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength)
      const palette = quantize(rgba, maxColors)
      const index = applyPalette(rgba, palette)
      gif.writeFrame(index, width, height, { palette, delay: 700 })
    }
    gif.finish()
    const out = Buffer.from(gif.bytes())
    if (out.length <= maxBytes) return out
  }
  return null
}

function toDataUrl(mime: string, buf: Buffer): string {
  return `data:${mime};base64,${buf.toString('base64')}`
}

export async function renderAdCreative(input: {
  html: string
  width: number
  height: number
  maxBytes: number
  baseName: string
  animate?: boolean
}): Promise<RenderResult> {
  const { html, width, height, maxBytes, baseName } = input
  const browser = await connect()
  try {
    const page = await loadPage(browser, html, width, height)
    const still2x = await screenshot2x(page, width, height)

    const files: RenderedFile[] = []
    const jpg = await toJpegUnderCap(still2x, width, height, maxBytes)
    files.push({
      name: `${baseName}.jpg`,
      mime: 'image/jpeg',
      bytes: jpg.length,
      withinCap: jpg.length <= maxBytes,
      dataUrl: toDataUrl('image/jpeg', jpg),
    })

    const png = await toPng(still2x, width, height, maxBytes)
    files.push({
      name: `${baseName}.png`,
      mime: 'image/png',
      bytes: png.length,
      withinCap: png.length <= maxBytes,
      dataUrl: toDataUrl('image/png', png),
    })

    if (input.animate) {
      const frameShots: Buffer[] = []
      for (const frame of [0, 1, 2, 3]) {
        await page.evaluate(f => document.body.setAttribute('data-frame', String(f)), frame)
        const shot2x = await screenshot2x(page, width, height)
        frameShots.push(await sharp(shot2x).resize(width, height, { kernel: 'lanczos3' }).png().toBuffer())
      }
      const gif = await framesToGif(frameShots, width, height, maxBytes)
      if (gif) {
        files.push({
          name: `${baseName}.gif`,
          mime: 'image/gif',
          bytes: gif.length,
          withinCap: true,
          dataUrl: toDataUrl('image/gif', gif),
        })
      }
    }

    await page.close()
    return { files, width, height, maxBytes }
  } finally {
    await browser.disconnect()
  }
}
