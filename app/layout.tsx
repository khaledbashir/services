import type { Metadata } from 'next'
import Script from 'next/script'
import { ToastProvider } from '@/components/toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'ANC Service Dashboard',
  description: 'ANC Sports Events Management',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon/favicon.ico" />
        <Script
          defer
          src="https://abc-umami.izcgmb.easypanel.host/script.js"
          data-website-id="48e5c173-88f1-45de-85ff-3d0341ef8894"
          strategy="afterInteractive"
        />
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
