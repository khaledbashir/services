import Link from 'next/link'

const FORMS = [
  {
    href: '/forms/design-request',
    title: 'Design Request',
    emoji: '🎨',
    desc: 'Graphics, ribbons, center-hung, video board content, tunnels',
    owner: 'Routes to Alexis Ventarola',
  },
  {
    href: '/forms/print-request',
    title: 'Print Request (Britten)',
    emoji: '🖨️',
    desc: 'Third-party fabricated signage — baselines, home plate, courtside',
    owner: 'Routes to Alexis Ventarola',
  },
  {
    href: '/forms/parts-order',
    title: 'Parts Order',
    emoji: '📦',
    desc: 'Internal parts ordering — cables, modules, replacements',
    owner: 'Routes to Gianni Strano',
  },
]

export default function FormsIndexPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Request a service</h1>
      <p className="text-sm text-gray-600 mb-8">
        Pick the form that matches what you need. Submissions create a record in the CRM and notify the right person.
      </p>
      <div className="space-y-3">
        {FORMS.map((f) => (
          <Link
            key={f.href}
            href={f.href}
            className="block bg-white rounded-xl border border-[var(--anc-border)] p-5 hover:border-[var(--anc-brand)] hover:shadow-sm transition"
          >
            <div className="flex items-start gap-4">
              <div className="text-3xl">{f.emoji}</div>
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{f.title}</div>
                <div className="text-sm text-gray-600 mt-0.5">{f.desc}</div>
                <div className="text-xs text-gray-400 mt-2">{f.owner}</div>
              </div>
              <div className="text-gray-300 text-xl">→</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
