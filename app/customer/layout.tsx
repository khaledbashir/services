import type { Metadata } from 'next'
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from 'next/font/google'
import './customer.css'

const barlow = Barlow({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--cp-font-body',
})

const barlowCondensed = Barlow_Condensed({
  subsets: ['latin'],
  weight: ['600', '700'],
  variable: '--cp-font-display',
})

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--cp-font-mono',
})

export const metadata: Metadata = {
  title: 'ANC Customer Portal',
  description: 'Track and submit service requests',
}

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`cp-root ${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable}`}>
      {children}
    </div>
  )
}
