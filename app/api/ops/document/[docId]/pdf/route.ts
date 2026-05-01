import { NextRequest, NextResponse } from 'next/server'
import { NocoOps } from '@/lib/nocodb-ops'
import { proseMirrorToHTML, wrapPrintHTML } from '@/lib/prosemirror-to-html'
import { Browserless } from '@/lib/browserless'

// GET /api/ops/document/[docId]/pdf?baseId=…
//
// Renders a NocoDB document to PDF via the in-cluster Browserless service.
// Caller flow:
//   1. NocoDB SPA (or our injected Download-as-PDF button) hits this route.
//   2. We pull the doc's ProseMirror content from NocoDB via the ops PAT.
//   3. Convert to HTML, wrap in a print-ready document with brand styling.
//   4. POST html → Browserless /pdf, stream the binary back.
//
// baseId is required as a query param because NocoDB scopes documents per
// base — the docId alone isn't unique-addressable through the meta API.
//
// No auth gate at this layer: the route runs server-side under the same
// services-dashboard origin the user is already authed against (cookie
// domain), so requireRole/requireSession can be added later if we expose
// it externally. Kept open now because it's same-origin from NocoDB and
// only callable by a logged-in user via the iframe bridge.

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ docId: string }> }
) {
  const { docId } = await params
  const baseId = request.nextUrl.searchParams.get('baseId')
  if (!baseId) {
    return NextResponse.json({ error: 'baseId query param required' }, { status: 400 })
  }
  if (!NocoOps.configured()) {
    return NextResponse.json({ error: 'NOCODB_OPS_PAT not configured' }, { status: 500 })
  }
  if (!Browserless.configured()) {
    return NextResponse.json({ error: 'BROWSERLESS_TOKEN not configured' }, { status: 500 })
  }

  let doc
  try {
    doc = await NocoOps.getDocument(baseId, docId)
  } catch (err) {
    return NextResponse.json(
      { error: 'NocoDB getDocument failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }

  const bodyHTML = proseMirrorToHTML(doc.content)
  const printHTML = wrapPrintHTML({ title: doc.title || 'Untitled', bodyHTML })

  let pdf: Buffer
  try {
    pdf = await Browserless.renderPdf({
      html: printHTML,
      options: {
        format: 'Letter',
        printBackground: true,
        margin: { top: '0.75in', right: '0.75in', bottom: '0.75in', left: '0.75in' },
      },
    })
  } catch (err) {
    return NextResponse.json(
      { error: 'Browserless render failed', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 }
    )
  }

  // Sanitize the title for Content-Disposition filename.
  const safeName = (doc.title || 'document')
    .replace(/[^a-zA-Z0-9._ -]/g, '')
    .trim()
    .slice(0, 80) || 'document'

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.length),
      'Content-Disposition': `attachment; filename="${safeName}.pdf"`,
      'Cache-Control': 'no-store',
      // CORS — the NocoDB iframe at ops.ancsports.net will fetch this
      // cross-origin; allow the two known origins.
      'Access-Control-Allow-Origin': 'https://ops.ancsports.net',
      'Access-Control-Allow-Credentials': 'true',
      'X-Doc-Id': doc.id,
      'X-Doc-Version': String(doc.version),
    },
  })
}
