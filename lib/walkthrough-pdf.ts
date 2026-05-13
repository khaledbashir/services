// Walkthrough PDF — same brand language as the Schedule Export PDF.
// Renders the per-asset matrix (Moynihan-style) so the techs' physical
// checklist is preserved as a single page-aware deliverable.

interface AssetFinding {
  display_id: number
  display_name: string
  image_quality: boolean
  av_rotation: boolean
  physical_damage: boolean
  pixel_outages: boolean
  cleanliness: boolean
}

interface WalkthroughForPdf {
  log_id: string
  technician: string
  venue_name: string
  date_label: string
  time_label: string
  type: string
  result: string
  comments: string
  ticket_number?: number | null
  locations: Array<{
    name: string
    findings: AssetFinding[]
  }>
}

const DIM_LABELS: Array<{ key: keyof Omit<AssetFinding, 'display_id' | 'display_name'>; label: string }> = [
  { key: 'image_quality', label: 'Image Quality' },
  { key: 'av_rotation', label: 'Ad Rotation' },
  { key: 'physical_damage', label: 'Physical Damage' },
  { key: 'pixel_outages', label: 'Pixel Outages' },
  { key: 'cleanliness', label: 'Cleanliness' },
]

function esc(s: string): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function buildWalkthroughHtml(w: WalkthroughForPdf): string {
  const resultColor = w.result === 'New Issue Detected' ? '#dc2626'
    : w.result === 'Open Issue Observed' ? '#d97706'
    : '#059669'

  const sections = w.locations.map((loc) => {
    const rows = loc.findings.map((f) => {
      const cells = DIM_LABELS.map((d) => {
        // Field semantics flipped 5/14: `true` = problem flagged, `false`
        // (default) = no problem on that dimension. Cell renders FAIL/red
        // when flagged, blank/white when not.
        const flagged = f[d.key]
        return `<td style="padding:4px 6px;text-align:center;border:1px solid #cbd5e1;background:${flagged ? '#fee2e2' : '#fff'};font-weight:${flagged ? '700' : '400'};color:${flagged ? '#b91c1c' : '#475569'}">${flagged ? 'FAIL' : ''}</td>`
      }).join('')
      return `<tr><td style="padding:4px 8px;border:1px solid #cbd5e1;font-size:9px">${esc(f.display_name)}</td>${cells}</tr>`
    }).join('')
    return `
      <div class="section">
        <div class="section-header">${esc(loc.name)}</div>
        <table>
          <thead>
            <tr>
              <th style="text-align:left;width:42%">Asset</th>
              ${DIM_LABELS.map((d) => `<th style="width:11.6%">${d.label}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows || `<tr><td colspan="6" style="padding:8px;text-align:center;color:#94a3b8;border:1px solid #cbd5e1">No assets recorded</td></tr>`}</tbody>
        </table>
      </div>
    `
  }).join('')

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
@page { size: letter; margin: 0 }
* { box-sizing: border-box; margin: 0; padding: 0 }
body { font-family: 'Inter', sans-serif; color: #1e293b; font-size: 10px; -webkit-print-color-adjust: exact; print-color-adjust: exact }
.header { background: linear-gradient(135deg, #001845 0%, #002C73 40%, #0A52EF 100%); color: white; padding: 28px 40px 22px; position: relative; overflow: hidden }
.slash { position: absolute; width: 50px; height: 180px; background: rgba(255,255,255,0.05); transform: skewX(-35deg) }
.header h1 { font-size: 16px; font-weight: 800; position: relative; z-index: 1 }
.header .sub { font-size: 10px; opacity: 0.75; margin-top: 3px; position: relative; z-index: 1 }
.content { padding: 18px 40px 24px }
.meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; padding: 10px 0; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0 }
.meta-grid .label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b }
.meta-grid .value { font-size: 11px; font-weight: 700; color: #1e293b; margin-top: 2px }
.result-pill { display: inline-block; padding: 2px 8px; border-radius: 12px; color: white; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px }
.section { margin-bottom: 14px; page-break-inside: avoid }
.section-header { background: #1e293b; color: white; padding: 6px 10px; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; border-radius: 3px 3px 0 0 }
table { width: 100%; border-collapse: collapse; font-size: 9px; background: white }
thead th { background: #f1f5f9; padding: 5px 6px; text-align: center; font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #475569; border: 1px solid #cbd5e1 }
.comments { margin-top: 16px; padding: 10px 12px; background: #f8fafc; border-left: 3px solid #0A52EF; font-size: 10px; line-height: 1.5; color: #334155; white-space: pre-wrap }
.comments-label { font-size: 7px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; margin-bottom: 4px }
.footer { margin-top: 24px; padding: 12px 40px; border-top: 1px solid #e2e8f0; display: flex; justify-content: space-between; font-size: 7px; color: #94a3b8 }
.ticket-line { margin-top: 6px; font-size: 9px; color: #b91c1c; font-weight: 600 }
</style></head><body>
<div class="header">
  <div class="slash" style="top:-30px;right:30px"></div>
  <div class="slash" style="top:-30px;right:90px"></div>
  <div class="slash" style="top:-30px;right:150px"></div>
  <h1>Walkthrough Report — ${esc(w.venue_name)}</h1>
  <div class="sub">${esc(w.log_id)} · ${esc(w.date_label)} · ${esc(w.time_label)}</div>
</div>
<div class="content">
  <div class="meta-grid">
    <div><div class="label">Technician</div><div class="value">${esc(w.technician)}</div></div>
    <div><div class="label">Venue</div><div class="value">${esc(w.venue_name)}</div></div>
    <div><div class="label">Type</div><div class="value">${esc(w.type)}</div></div>
    <div><div class="label">Result</div><div class="value"><span class="result-pill" style="background:${resultColor}">${esc(w.result)}</span></div></div>
  </div>
  ${sections}
  ${w.comments ? `<div class="comments"><div class="comments-label">Notes</div>${esc(w.comments).replace(/\n/g, '<br>')}</div>` : ''}
  ${w.ticket_number ? `<div class="ticket-line">Linked ticket: #${String(w.ticket_number).padStart(5, '0')}</div>` : ''}
</div>
<div class="footer">
  <span>ANC Sports — Service Dashboard</span>
  <span>Generated ${esc(new Date().toLocaleString('en-US'))}</span>
</div>
</body></html>`
}

export type { WalkthroughForPdf, AssetFinding }
