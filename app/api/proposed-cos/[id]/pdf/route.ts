export const dynamic = 'force-dynamic'
export const revalidate = 0

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { Browserless } from '@/lib/browserless'

const PROJECT_LABEL: Record<string, string> = {
  'service-dashboard': 'Service Dashboard',
  'proposal-engine': 'Proposal Engine',
  'crm': 'CRM',
  'kb': 'Knowledge Base',
  'mirror-mode': 'Mirror Mode',
  'anything-llm': 'AI Assistant',
  'cross-platform': 'Cross-platform bundle',
}

function fmtUSD(n: number | null | undefined): string {
  if (!n || !Number.isFinite(Number(n))) return '—'
  return '$' + Math.round(Number(n)).toLocaleString('en-US')
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderHtml(p: any, baseUrl: string): string {
  const projectLabel = p.target_project ? (PROJECT_LABEL[p.target_project] || p.target_project) : null
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
  const validUntil = new Date(Date.now() + 14 * 86400000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })

  const bullets: string[] = Array.isArray(p.bullets) ? p.bullets : []

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Change Order — ${escapeHtml(p.name || 'Untitled')}</title>
<style>
  @page { size: Letter; margin: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1b3a5f;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    padding: 56px 64px;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  .brand-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1b3a5f;
    padding-bottom: 18px;
    margin-bottom: 36px;
  }
  .brand-mark {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #1b3a5f;
    text-transform: uppercase;
  }
  .brand-sub {
    font-size: 10px;
    color: #6b7d92;
    margin-top: 4px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .doc-meta {
    text-align: right;
    font-size: 10px;
    color: #6b7d92;
    line-height: 1.6;
  }
  .doc-meta strong { color: #1b3a5f; font-weight: 600; }
  h1 {
    font-size: 32px;
    font-weight: 700;
    line-height: 1.2;
    color: #1b3a5f;
    margin: 0 0 8px;
    letter-spacing: -0.01em;
  }
  .eyebrow {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #6b7d92;
    text-transform: uppercase;
    margin-bottom: 6px;
  }
  .pitch {
    font-size: 14px;
    color: #4a5e75;
    line-height: 1.55;
    margin: 0 0 32px;
    max-width: 580px;
  }
  .investment-card {
    background: #f5f8fc;
    border: 1px solid #dbe4ee;
    border-radius: 8px;
    padding: 18px 22px;
    margin: 28px 0 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .investment-amount {
    font-size: 32px;
    font-weight: 700;
    color: #1b3a5f;
    line-height: 1;
  }
  .investment-meta {
    text-align: right;
    font-size: 11px;
    color: #6b7d92;
    line-height: 1.6;
  }
  .investment-meta strong { color: #1b3a5f; font-weight: 600; font-size: 12px; }
  h2 {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.18em;
    color: #6b7d92;
    text-transform: uppercase;
    margin: 28px 0 12px;
  }
  .bullets {
    list-style: none;
    padding: 0;
    margin: 0 0 28px;
  }
  .bullets li {
    padding: 8px 0 8px 28px;
    border-bottom: 1px solid #eef2f7;
    position: relative;
    font-size: 13px;
    line-height: 1.55;
    color: #2d3e57;
  }
  .bullets li:last-child { border-bottom: none; }
  .bullets li::before {
    content: "✓";
    position: absolute;
    left: 0;
    top: 8px;
    width: 18px;
    height: 18px;
    background: #1b3a5f;
    color: #fff;
    border-radius: 50%;
    text-align: center;
    line-height: 18px;
    font-size: 10px;
    font-weight: 700;
  }
  .benefit {
    background: #ecf3ec;
    border-left: 3px solid #2d6a4f;
    padding: 14px 18px;
    border-radius: 0 6px 6px 0;
    margin: 20px 0 32px;
    font-size: 13px;
    color: #1f3d2e;
    line-height: 1.55;
  }
  .benefit strong { color: #1f3d2e; font-weight: 700; }
  .terms {
    font-size: 11px;
    color: #4a5e75;
    line-height: 1.7;
    border-top: 1px solid #dbe4ee;
    padding-top: 18px;
    margin-top: 32px;
  }
  .terms p { margin: 0 0 6px; }
  .signature-block {
    margin-top: 48px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 48px;
  }
  .signature-row {
    border-top: 1px solid #1b3a5f;
    padding-top: 8px;
    font-size: 10px;
    color: #6b7d92;
    text-transform: uppercase;
    letter-spacing: 0.12em;
  }
  .footer {
    margin-top: 36px;
    padding-top: 16px;
    border-top: 1px solid #eef2f7;
    text-align: center;
    font-size: 9px;
    color: #9aa8bc;
    letter-spacing: 0.06em;
  }
</style>
</head>
<body>
  <div class="page">
    <div class="brand-row">
      <div>
        <div class="brand-mark">ANC Sports</div>
        <div class="brand-sub">Service Contract — Change Order</div>
      </div>
      <div class="doc-meta">
        <div><strong>Issued</strong> ${today}</div>
        <div><strong>Valid until</strong> ${validUntil}</div>
        <div><strong>Reference</strong> CO-${String(p.id).slice(0, 8).toUpperCase()}</div>
      </div>
    </div>

    <div class="eyebrow">${p.category === 'bundle' ? 'Bundle proposal' : 'Single feature proposal'}${projectLabel ? ' · ' + escapeHtml(projectLabel) : ''}</div>
    <h1>${escapeHtml(p.name || 'Untitled')}</h1>
    ${p.pitch ? `<p class="pitch">${escapeHtml(p.pitch)}</p>` : ''}

    <div class="investment-card">
      <div>
        <div style="font-size:10px;font-weight:700;letter-spacing:0.18em;color:#6b7d92;text-transform:uppercase;margin-bottom:4px">Investment</div>
        <div class="investment-amount">${fmtUSD(p.price_usd)}</div>
      </div>
      <div class="investment-meta">
        ${p.timeline_label ? `<div><strong>Delivery</strong> ${escapeHtml(p.timeline_label)}</div>` : ''}
        <div><strong>Warranty</strong> 30 days post-delivery</div>
        <div><strong>Currency</strong> USD</div>
      </div>
    </div>

    ${bullets.length > 0 ? `
      <h2>What&rsquo;s included</h2>
      <ul class="bullets">
        ${bullets.map((b) => `<li>${escapeHtml(String(b))}</li>`).join('')}
      </ul>
    ` : ''}

    ${p.benefit ? `
      <h2>The win</h2>
      <div class="benefit">${escapeHtml(p.benefit)}</div>
    ` : ''}

    <h2>Terms</h2>
    <div class="terms">
      <p>One number, one delivery, one invoice — no hourly variance.</p>
      <p>Includes 30-day post-delivery responsibility window: regressions on the same delivery are fixed at no charge during that window.</p>
      <p>50% on signature, 50% on delivery, unless otherwise agreed.</p>
      <p>Quote valid for 14 days from the issue date above.</p>
      <p>Approval by reply to this proposal in writing constitutes acceptance.</p>
    </div>

    <div class="signature-block">
      <div>
        <div class="signature-row">Approved by ANC</div>
        <div style="height:48px"></div>
        <div class="signature-row">Date</div>
      </div>
      <div>
        <div class="signature-row">Ahmad Basheer</div>
        <div style="height:48px"></div>
        <div class="signature-row">Date</div>
      </div>
    </div>

    <div class="footer">
      ANC Sports · Standard service contract · 30-day post-delivery warranty per project
    </div>
  </div>
</body>
</html>`
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const r = await query(`SELECT * FROM proposed_change_orders WHERE id = $1`, [id])
  if (r.rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const p = r.rows[0]

  if (!Browserless.configured()) {
    return NextResponse.json({ error: 'Browserless not configured' }, { status: 503 })
  }

  const baseUrl = new URL(request.url).origin
  const html = renderHtml(p, baseUrl)
  let pdf: Buffer
  try {
    pdf = await Browserless.renderPdf({
      html,
      options: {
        format: 'Letter',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
      },
    })
  } catch (err) {
    console.error('[proposed-cos pdf] render failed:', err)
    return NextResponse.json({ error: 'PDF render failed', detail: String(err) }, { status: 502 })
  }

  const filename = `ANC-CO-${(p.name || 'proposal').slice(0, 40).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`

  // Convert Node Buffer to ArrayBuffer for the Response constructor
  const ab = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer
  return new Response(ab, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
