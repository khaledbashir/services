/**
 * POST /api/project-schedule/[id]/submittals/ocr
 *
 * Upload drawing PDF(s) / images → OCR each page's title block → extract a
 * structured list of detected submittals { sheetNumber, title, revision,
 * packageType }. Returns the detections for a review step. Nothing is created
 * here — the reviewed items are POSTed to .../submittals to auto-create.
 *
 * Borrowed pipeline (adapted from the sister app's drawing analyzer):
 *   lib/ocr/pdfToImages.ts      → pdftoppm page→JPEG, pdfinfo page count
 *   lib/ocr/mistralOcrClient.ts → Mistral vision OCR per page (title blocks)
 *   lib/ocr/submittal-extract.ts→ structured extraction via the app's LLM
 *
 * Body: multipart/form-data with one or more `files` entries (PDF or image).
 */

import { NextRequest, NextResponse } from 'next/server'
import { mkdtemp, writeFile, rm } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { isAuthError, requireRole } from '@/lib/rbac'
import { convertPageToImage, getPdfPageCount } from '@/lib/ocr/pdfToImages'
import { extractSinglePage, isMistralOcrConfigured, pageText } from '@/lib/ocr/mistralOcrClient'
import { extractSubmittals, type DetectedSubmittal } from '@/lib/ocr/submittal-extract'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

// Cap pages per the sister app's drawing analyzer — title-block sets are small.
const MAX_PAGES = 20
const IMAGE_RE = /\.(png|jpe?g|tiff?|bmp|webp)$/i

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const auth = await requireRole(request, 'manager')
  if (isAuthError(auth)) return auth

  // Graceful degradation — mirror lib/email.ts: clear message, no raw key error.
  if (!isMistralOcrConfigured()) {
    return NextResponse.json(
      {
        error: 'OCR not configured',
        detail:
          'Drawing OCR is not set up on this server yet. An admin needs to add the OCR credentials (MISTRAL_API_KEY, MISTRAL_OCR_MODEL, MISTRAL_API_BASE_URL) before drawings can be read automatically.',
      },
      { status: 503 },
    )
  }

  let workDir: string | null = null
  try {
    const formData = await request.formData()
    const files = formData.getAll('files').filter((f): f is File => f instanceof File)
    // Also accept a single `file` field for convenience.
    const single = formData.get('file')
    if (single instanceof File) files.push(single)

    if (!files.length) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
    }

    workDir = await mkdtemp(path.join(tmpdir(), 'anc-submittal-ocr-'))

    const ocrTextChunks: string[] = []
    let pagesProcessed = 0

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer())
      const isImage = IMAGE_RE.test(file.name)
      const safeName = file.name.replace(/[^a-z0-9.-]/gi, '_')
      const filePath = path.join(workDir, safeName)
      await writeFile(filePath, buffer)

      if (isImage) {
        try {
          const ocr = await extractSinglePage(filePath, 1)
          ocrTextChunks.push(`=== ${file.name} (page 1) ===\n${pageText(ocr)}`)
          pagesProcessed += 1
        } catch (err) {
          console.error(`[submittal-ocr] image OCR failed for ${file.name}:`, err instanceof Error ? err.message : err)
        }
        continue
      }

      // PDF — count pages, convert each to an image, OCR each (capped).
      const pageCount = await getPdfPageCount(filePath)
      const maxPages = Math.min(pageCount, MAX_PAGES)
      for (let p = 1; p <= maxPages; p++) {
        try {
          const pageDir = path.join(workDir, `${safeName}-p${p}`)
          const imagePath = await convertPageToImage(filePath, p, pageDir)
          const ocr = await extractSinglePage(imagePath, p)
          ocrTextChunks.push(`=== ${file.name} (page ${p}) ===\n${pageText(ocr)}`)
          pagesProcessed += 1
        } catch (err) {
          console.error(`[submittal-ocr] page ${p} OCR failed for ${file.name}:`, err instanceof Error ? err.message : err)
        }
      }
    }

    const ocrText = ocrTextChunks.join('\n\n').trim()
    if (!ocrText) {
      return NextResponse.json(
        { error: 'No readable text found in the uploaded drawings.' },
        { status: 422 },
      )
    }

    const { submittals, method } = await extractSubmittals(ocrText)

    return NextResponse.json({
      pagesProcessed,
      filesProcessed: files.length,
      method,
      detected: submittals as DetectedSubmittal[],
    })
  } catch (err) {
    console.error('[submittal-ocr] error:', err)
    return NextResponse.json({ error: 'OCR processing failed' }, { status: 500 })
  } finally {
    if (workDir) {
      try {
        await rm(workDir, { recursive: true, force: true })
      } catch {
        /* best-effort cleanup */
      }
    }
  }
}
