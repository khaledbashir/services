/**
 * Exercises the ad-creative render pipeline end-to-end against a live
 * browserless instance. Run: node scripts/test-ad-creative-render.ts
 * Requires BROWSERLESS_URL (+ BROWSERLESS_TOKEN) pointing at Chrome.
 */
import { writeFile } from 'fs/promises'
import { buildAdHtml } from '../lib/marketing/ad-creative/templates.ts'
import { readLibraryPhotoDataUri, readLogoDataUri } from '../lib/marketing/ad-creative/library.ts'
import { renderAdCreative } from '../lib/marketing/ad-creative/render.ts'

async function main() {
  const photoDataUri = await readLibraryPhotoDataUri('levis-touchdown')
  const logoDataUri = await readLogoDataUri('white')
  if (!photoDataUri) throw new Error('photo missing')

  const html = buildAdHtml({
    template: 'spotlight',
    width: 650,
    height: 250,
    copy: {
      eyebrow: 'Venue Technology Partner',
      headline: 'The technology behind football’s **biggest moments**',
      cta: 'See What’s Possible',
    },
    photoDataUri,
    logoDataUri,
    photoFocusY: 35,
  })

  const result = await renderAdCreative({
    html,
    width: 650,
    height: 250,
    maxBytes: 250 * 1024,
    baseName: 'test-sbj-adunit',
    animate: true,
  })

  for (const file of result.files) {
    const buf = Buffer.from(file.dataUrl.split(',')[1], 'base64')
    const out = `/tmp/claude-0/-root-anc-services/757e5cd7-9906-487d-9664-cab19273ed53/scratchpad/${file.name}`
    await writeFile(out, buf)
    console.log(`${file.name}  ${file.mime}  ${Math.round(file.bytes / 1024)}KB  withinCap=${file.withinCap}  -> ${out}`)
  }

  const cinematic = buildAdHtml({
    template: 'cinematic',
    width: 600,
    height: 314,
    copy: { headline: '' },
    photoDataUri: (await readLibraryPhotoDataUri('levis-night'))!,
    logoDataUri,
    photoFocusY: 88,
  })
  const headerResult = await renderAdCreative({
    html: cinematic,
    width: 600,
    height: 314,
    maxBytes: 250 * 1024,
    baseName: 'test-sbj-header',
  })
  for (const file of headerResult.files) {
    const buf = Buffer.from(file.dataUrl.split(',')[1], 'base64')
    const out = `/tmp/claude-0/-root-anc-services/757e5cd7-9906-487d-9664-cab19273ed53/scratchpad/${file.name}`
    await writeFile(out, buf)
    console.log(`${file.name}  ${file.mime}  ${Math.round(file.bytes / 1024)}KB  withinCap=${file.withinCap}  -> ${out}`)
  }

  // Leaderboard compact-layout sanity check (90px tall path)
  const leaderboard = buildAdHtml({
    template: 'spotlight',
    width: 728,
    height: 90,
    copy: { headline: 'Game day runs on ANC technology', cta: 'Learn More' },
    photoDataUri,
    logoDataUri,
  })
  const lbResult = await renderAdCreative({
    html: leaderboard,
    width: 728,
    height: 90,
    maxBytes: 200 * 1024,
    baseName: 'test-leaderboard',
  })
  for (const file of lbResult.files) {
    const buf = Buffer.from(file.dataUrl.split(',')[1], 'base64')
    const out = `/tmp/claude-0/-root-anc-services/757e5cd7-9906-487d-9664-cab19273ed53/scratchpad/${file.name}`
    await writeFile(out, buf)
    console.log(`${file.name}  ${file.mime}  ${Math.round(file.bytes / 1024)}KB  withinCap=${file.withinCap}  -> ${out}`)
  }

  console.log('RENDER PIPELINE OK')
}

main().catch(err => {
  console.error('RENDER PIPELINE FAILED:', err)
  process.exit(1)
})
