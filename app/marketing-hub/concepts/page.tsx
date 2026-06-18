import Link from 'next/link'

export default function MarketingHubConceptsPage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: '#05070a',
      color: '#f6f8fb',
      padding: '72px 24px',
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    }}>
      <div style={{ maxWidth: 1040, margin: '0 auto' }}>
        <p style={{
          margin: '0 0 28px',
          color: '#03b4ff',
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
        }}>
          ANC Marketing Hub Concepts
        </p>
        <h1 style={{
          margin: 0,
          maxWidth: 780,
          fontSize: 'clamp(44px, 8vw, 96px)',
          lineHeight: 0.95,
          fontWeight: 900,
          letterSpacing: 0,
        }}>
          Visual systems for the things ANC needs to show.
        </h1>
        <p style={{
          margin: '28px 0 56px',
          maxWidth: 620,
          color: 'rgba(246, 248, 251, 0.68)',
          fontSize: 17,
          lineHeight: 1.65,
        }}>
          Presentation, client portal, project status, service proof, QBR, and campaign storytelling concepts live here before they graduate into the builder.
        </p>
        <nav style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}>
          <Link
            href="/marketing-hub/concepts/anc-kinetic"
            style={{
              display: 'grid',
              gridTemplateColumns: '72px minmax(0,1fr) auto',
              gap: 24,
              alignItems: 'center',
              padding: '28px 0',
              borderBottom: '1px solid rgba(255,255,255,0.12)',
              color: 'inherit',
              textDecoration: 'none',
            }}
          >
            <span style={{ color: 'rgba(246,248,251,0.45)', fontSize: 12, fontWeight: 800 }}>01</span>
            <span style={{ fontSize: 'clamp(24px, 4vw, 44px)', fontWeight: 900 }}>ANC Kinetic Service Film</span>
            <span style={{ color: '#03b4ff', fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>Open</span>
          </Link>
        </nav>
      </div>
    </main>
  )
}
