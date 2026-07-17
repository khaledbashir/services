import { query } from '@/lib/db'
import { slackApi, sendSlackMessage } from '@/lib/slack'
import { ensureConfigError, graphConfigured, uploadFile } from '@/lib/msgraph-files'
import { analyzeTechPhoto } from '@/lib/photo-vision'
import { getMultimodalEmbedding } from '@/lib/embeddings'

type SweepError = { channel?: string; file?: string; error: string }

type VenueReport = {
  venue: string
  found: number
  filed: number
  filenames?: string[]
}

export type SweepReport = {
  ok: boolean
  dry: boolean
  channelsChecked: number
  imagesFound: number
  filed: number
  skippedDuplicates: number
  errors: SweepError[]
  perVenue: VenueReport[]
  graphReady?: boolean
  error?: string
}

type Venue = { id: number; name: string; slack_channel_id: string }
type SlackImage = {
  id: string
  name: string
  mimetype: string
  size: number
  downloadUrl: string
  user: string
  ts: string
}
type PendingImage = SlackImage & { venue: Venue; poster: string; filename: string; filedPath: string }

function sanitize(value: string, fallback: string, maxLength?: number): string {
  const clean = value
    .replace(/[\\/:*?"<>|]/g, '')
    .trim()
    .replace(/\s+/g, '-')
  return (clean || fallback).slice(0, maxLength || clean.length || fallback.length)
}

function messageDate(ts: string): Date {
  return new Date(Number.parseFloat(ts) * 1000 - 4 * 60 * 60 * 1000)
}

function datePart(date: Date, compact = false): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return compact ? `${year}${month}${day}` : `${year}-${month}-${day}`
}

function weekFolder(ts: string): string {
  const date = messageDate(ts)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1))
  return `Week of ${datePart(date)}`
}

async function historyPage(channel: string, oldest: string, cursor?: string): Promise<any> {
  const body: Record<string, string | number> = { channel, oldest, limit: 200 }
  if (cursor) body.cursor = cursor
  return slackApi('conversations.history', body)
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

// conversations.history is a Slack Tier-3 method (~50 calls/min). The sweep
// walks 150+ venue channels in one run, so calls are paced to stay under the
// tier and `ratelimited` responses back off and retry instead of dropping the
// channel (a full-fleet sweep at ~1.2s/call runs a few minutes — fine for a
// weekly cron).
const HISTORY_PACE_MS = 1200
let lastHistoryAt = 0

async function pacedHistoryPage(channel: string, oldest: string, cursor?: string): Promise<any> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = lastHistoryAt + HISTORY_PACE_MS - Date.now()
    if (wait > 0) await sleep(wait)
    lastHistoryAt = Date.now()
    const response = await historyPage(channel, oldest, cursor)
    if (response.ok || response.error !== 'ratelimited') return response
    await sleep((attempt + 1) * 10_000)
  }
  return { ok: false, error: 'ratelimited after retries' }
}

async function channelImages(venue: Venue, oldest: string, errors: SweepError[]): Promise<SlackImage[]> {
  const images = new Map<string, SlackImage>()
  let cursor = ''
  let joined = false

  while (true) {
    try {
      let response = await pacedHistoryPage(venue.slack_channel_id, oldest, cursor || undefined)
      if (!response.ok && response.error === 'not_in_channel' && !joined) {
        joined = true
        const join = await slackApi('conversations.join', { channel: venue.slack_channel_id })
        if (!join.ok) {
          errors.push({ channel: venue.slack_channel_id, error: join.error || 'conversations.join failed' })
          break
        }
        response = await pacedHistoryPage(venue.slack_channel_id, oldest, cursor || undefined)
      }
      if (!response.ok) {
        errors.push({ channel: venue.slack_channel_id, error: response.error || 'conversations.history failed' })
        break
      }

      for (const message of response.messages || []) {
        for (const file of message.files || []) {
          if (!String(file.mimetype || '').startsWith('image/')) continue
          const downloadUrl = file.url_private_download || file.url_private
          if (!file.id || !downloadUrl) continue
          images.set(file.id, {
            id: file.id,
            name: file.name || file.id,
            mimetype: file.mimetype,
            size: Number(file.size) || 0,
            downloadUrl,
            user: message.user || '',
            ts: message.ts,
          })
        }
      }

      cursor = response.response_metadata?.next_cursor || ''
      if (!cursor) break
    } catch (error) {
      errors.push({ channel: venue.slack_channel_id, error: error instanceof Error ? error.message : String(error) })
      break
    }
  }

  return [...images.values()]
}

async function posterName(userId: string, cache: Map<string, string>): Promise<string> {
  if (!userId) return 'unknown'
  const cached = cache.get(userId)
  if (cached) return cached

  try {
    const response = await slackApi('users.info', { user: userId })
    const name = response.ok
      ? response.user?.profile?.display_name || response.user?.profile?.real_name || response.user?.real_name || userId
      : userId
    cache.set(userId, name)
    return name
  } catch {
    cache.set(userId, userId)
    return userId
  }
}

/**
 * Gallery enrichment for one photo: in-DB thumbnail (SharePoint URLs need
 * Jeremy's drive permissions — the gallery serves its own copy), Gemini vision
 * analysis, multimodal embedding for the gallery's similarity search, and the
 * Slack permalink. Every step fail-soft — filing never waits on enrichment.
 */
async function enrichPhoto(
  data: Buffer,
  image: { id: string; mimetype: string; ts: string },
  channelId: string,
  venueName: string,
): Promise<void> {
  try {
    const sharp = (await import('sharp')).default
    const thumb = await sharp(data)
      .rotate()
      .resize(900, 900, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 75 })
      .toBuffer()

    const base64 = thumb.toString('base64')
    const analysis = await analyzeTechPhoto(base64, 'image/jpeg', `Venue: ${venueName}`)

    let embedding: number[] | null = null
    try {
      embedding = await getMultimodalEmbedding(
        [analysis?.title, analysis?.description, venueName].filter(Boolean).join(' — ') || venueName,
        base64,
        'image/jpeg',
      )
    } catch {
      // embedding is search sugar — never required
    }

    let permalink: string | null = null
    try {
      const linkRes = await slackApi('chat.getPermalink', { channel: channelId, message_ts: image.ts })
      if (linkRes.ok) permalink = linkRes.permalink || null
    } catch {
      // permalink is a nice-to-have
    }

    await query(
      `UPDATE slack_photo_files
       SET thumb = $2, thumb_mime = 'image/jpeg', ai_title = $3, ai_category = $4,
           ai_description = $5, ai_tags = $6, embedding = $7, slack_permalink = $8
       WHERE slack_file_id = $1`,
      [
        image.id,
        thumb,
        analysis?.title || null,
        analysis?.category || null,
        analysis?.description || null,
        analysis ? JSON.stringify(analysis.tags) : null,
        embedding,
        permalink,
      ]
    )
  } catch (error) {
    console.warn(`[photo-sweep] enrichment failed for ${image.id}:`, error instanceof Error ? error.message : error)
  }
}

/**
 * Enrich any already-filed rows that predate the gallery columns (or whose
 * enrichment failed). Re-downloads the original from Slack via files.info.
 * Runs at the start of every real sweep — self-healing, capped per run.
 */
async function backfillEnrichment(): Promise<void> {
  try {
    const rows = await query(
      `SELECT slack_file_id, channel_id, venue_name, posted_at
       FROM slack_photo_files WHERE thumb IS NULL ORDER BY created_at DESC LIMIT 25`
    )
    for (const row of rows.rows) {
      try {
        // files.info is a GET-family method — it rejects JSON POST bodies
        // (invalid_arguments), so it can't go through slackApi().
        const infoRes = await fetch(
          `https://slack.com/api/files.info?file=${encodeURIComponent(row.slack_file_id)}`,
          { headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN || ''}` } },
        )
        const info: any = await infoRes.json()
        const url = info?.file?.url_private_download || info?.file?.url_private
        if (!info.ok || !url) continue
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN || ''}` },
        })
        if (!res.ok) continue
        const data = Buffer.from(await res.arrayBuffer())
        await enrichPhoto(
          data,
          {
            id: row.slack_file_id,
            mimetype: info.file?.mimetype || 'image/jpeg',
            ts: String(new Date(row.posted_at).getTime() / 1000),
          },
          row.channel_id,
          row.venue_name || ''
        )
      } catch {
        // per-row fail-soft
      }
    }
  } catch (error) {
    console.warn('[photo-sweep] backfill enrichment failed:', error instanceof Error ? error.message : error)
  }
}

function baseReport(dry: boolean): SweepReport {
  return {
    ok: true,
    dry,
    channelsChecked: 0,
    imagesFound: 0,
    filed: 0,
    skippedDuplicates: 0,
    errors: [],
    perVenue: [],
  }
}

export async function runPhotoSweep(opts: { days?: number; dry?: boolean; venue?: string }): Promise<SweepReport> {
  const dry = opts.dry === true
  const report = baseReport(dry)

  if (!dry && !graphConfigured()) {
    return { ...report, ok: false, error: ensureConfigError() }
  }

  const days = Math.min(31, Math.max(1, Math.floor(opts.days || 7)))
  const oldest = String(Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000))
  const venuesResult = await query(
    `SELECT id, name, slack_channel_id FROM venues
     WHERE slack_channel_id IS NOT NULL AND slack_channel_id <> ''`
  )
  let venues = venuesResult.rows as Venue[]
  // Optional scope filter — a venue-name substring or exact channel id. Lets
  // an operator spot-check one channel synchronously (seconds) while the
  // full-fleet sweep stays an async, minutes-long run.
  const venueFilter = (opts.venue || '').trim().toLowerCase()
  if (venueFilter) {
    venues = venues.filter(
      v =>
        v.slack_channel_id.toLowerCase() === venueFilter ||
        v.name.toLowerCase().includes(venueFilter)
    )
  }
  const userCache = new Map<string, string>()
  const seenFileIds = new Set<string>()
  const pending: PendingImage[] = []

  for (const venue of venues) {
    report.channelsChecked += 1
    const images = await channelImages(venue, oldest, report.errors)
    report.imagesFound += images.length
    const venueReport: VenueReport = { venue: venue.name, found: images.length, filed: 0 }
    if (dry) venueReport.filenames = []
    report.perVenue.push(venueReport)

    let duplicateIds = new Set<string>()
    if (images.length > 0) {
      const duplicateResult = await query(
        `SELECT slack_file_id FROM slack_photo_files WHERE slack_file_id = ANY($1::text[])`,
        [images.map(image => image.id)]
      )
      duplicateIds = new Set(duplicateResult.rows.map(row => row.slack_file_id))
    }

    for (const image of images) {
      if (duplicateIds.has(image.id) || seenFileIds.has(image.id)) {
        report.skippedDuplicates += 1
        continue
      }
      seenFileIds.add(image.id)
      const poster = await posterName(image.user, userCache)
      const safePoster = sanitize(poster, image.user || 'unknown')
      const safeOriginalName = sanitize(image.name, image.id)
      const filename = `${datePart(messageDate(image.ts), true)}-${safePoster}-${safeOriginalName}`
      const safeVenue = sanitize(venue.name, 'Unsorted', 100)
      const filedPath = `${weekFolder(image.ts)}/${safeVenue}/${filename}`
      pending.push({ ...image, venue, poster, filename, filedPath })
      if (dry) venueReport.filenames?.push(filename)
    }
  }

  if (dry) {
    report.graphReady = graphConfigured()
    return report
  }

  await backfillEnrichment()

  let missingFilesScope = false
  for (const image of pending) {
    if (missingFilesScope) break
    try {
      const response = await fetch(image.downloadUrl, {
        headers: { Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN || ''}` },
      })
      const contentType = response.headers.get('content-type') || ''
      if (contentType.toLowerCase().includes('text/html')) {
        report.errors.push({ channel: image.venue.slack_channel_id, file: image.name, error: 'missing files:read scope' })
        report.ok = false
        missingFilesScope = true
        break
      }
      if (!response.ok) throw new Error(`Slack file download failed: ${response.status}`)

      const data = Buffer.from(await response.arrayBuffer())
      const uploaded = await uploadFile(image.filedPath, data)
      await query(
        `INSERT INTO slack_photo_files
          (slack_file_id, channel_id, venue_id, venue_name, poster, posted_at, filename, filed_path, web_url, bytes)
         VALUES ($1, $2, $3, $4, $5, to_timestamp($6), $7, $8, $9, $10)`,
        [
          image.id,
          image.venue.slack_channel_id,
          image.venue.id,
          image.venue.name,
          image.poster,
          Number.parseFloat(image.ts),
          image.filename,
          image.filedPath,
          uploaded.webUrl,
          data.length,
        ]
      )
      report.filed += 1
      const venueReport = report.perVenue.find(item => item.venue === image.venue.name)
      if (venueReport) venueReport.filed += 1

      // Gallery enrichment — thumbnail + AI analysis + embedding. Fail-soft.
      await enrichPhoto(data, image, image.venue.slack_channel_id, image.venue.name)
    } catch (error) {
      report.errors.push({
        channel: image.venue.slack_channel_id,
        file: image.name,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (report.filed > 0) {
    const venuesFiled = report.perVenue.filter(venue => venue.filed > 0).length
    const channel = process.env.SLACK_DEFAULT_CHANNEL || ''
    if (channel) {
      await sendSlackMessage({
        channel,
        text: `📸 Weekly photo sweep: filed ${report.filed} technician photos from ${venuesFiled} venues → ${process.env.SLACK_PHOTO_FOLDER_URL}`,
      })
    }

    // Confirm in each swept channel too — the teams that posted the photos
    // see them get filed (Ahmad 2026-07-17: results go to the normal channels,
    // not only an ops channel). Fail-soft per channel.
    const folderUrl = process.env.SLACK_PHOTO_FOLDER_URL || ''
    const confirmed = new Set<string>()
    for (const image of pending) {
      const venueReport = report.perVenue.find(item => item.venue === image.venue.name)
      if (!venueReport || venueReport.filed === 0) continue
      if (confirmed.has(image.venue.slack_channel_id)) continue
      confirmed.add(image.venue.slack_channel_id)
      try {
        await sendSlackMessage({
          channel: image.venue.slack_channel_id,
          text: `📸 Filed ${venueReport.filed} photo${venueReport.filed === 1 ? '' : 's'} from this channel to the Sales library → ${folderUrl}`,
        })
      } catch {
        // channel confirmation is best-effort — never fail the sweep over it
      }
    }
  }

  return report
}
