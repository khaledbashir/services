/**
 * PDF → JPEG conversion using pdftoppm (poppler-utils).
 *
 * Converts individual PDF pages to JPEG images, one page at a time so memory
 * stays flat no matter the PDF size. Borrowed from the sister app's drawing
 * pipeline (services/rfp/unified/pdfToImages.ts) and kept self-contained —
 * Node built-ins only, plus the pdftoppm binary (poppler-utils, installed on
 * the box). Used by the submittal OCR auto-create route.
 */

import { execFile } from 'child_process'
import { mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { promisify } from 'util'
import path from 'path'

const execFileAsync = promisify(execFile)

/**
 * Convert a single PDF page to a JPEG image.
 *
 * @param pdfPath    - Path to the PDF on disk
 * @param pageNumber - 1-based page number
 * @param outputDir  - Directory to write the JPEG
 * @returns Path to the output JPEG file
 */
export async function convertPageToImage(
  pdfPath: string,
  pageNumber: number,
  outputDir: string,
): Promise<string> {
  if (!existsSync(outputDir)) {
    await mkdir(outputDir, { recursive: true })
  }

  const outputPrefix = path.join(outputDir, 'page')

  // pdftoppm -f N -l N -jpeg -r 200 input.pdf output-prefix
  //   -f / -l : first / last page (same value = single page)
  //   -jpeg   : JPEG output
  //   -r 200  : 200 DPI — good balance of legibility vs file size for title blocks
  await execFileAsync(
    'pdftoppm',
    ['-f', String(pageNumber), '-l', String(pageNumber), '-jpeg', '-r', '200', pdfPath, outputPrefix],
    { timeout: 30_000 },
  )

  // pdftoppm names output {prefix}-{pagenum padded}.jpg — find the actual file
  // and normalize it to our convention.
  const { readdir } = await import('fs/promises')
  const files = await readdir(outputDir)
  const match = files.find((f) => f.startsWith('page-') && f.endsWith('.jpg'))

  if (!match) {
    throw new Error(`pdftoppm produced no output for page ${pageNumber}`)
  }

  const finalPath = path.join(outputDir, `page-${pageNumber}.jpg`)
  const srcPath = path.join(outputDir, match)
  if (srcPath !== finalPath) {
    const { rename } = await import('fs/promises')
    await rename(srcPath, finalPath)
  }

  return finalPath
}

/**
 * Read the page count of a PDF via `pdfinfo` (poppler-utils). Falls back to 1
 * if pdfinfo is unavailable or the output can't be parsed.
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync('pdfinfo', [pdfPath], { timeout: 15_000 })
    const match = stdout.match(/Pages:\s+(\d+)/)
    return match ? parseInt(match[1], 10) : 1
  } catch {
    return 1
  }
}
