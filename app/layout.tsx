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
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href="/favicon.ico" />
        <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
        <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        <link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png" />
        <link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png" />
        <Script
          id="anc-theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var key='anc-theme';var saved=localStorage.getItem(key);var prefers=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;var theme=saved||(prefers?'dark':'light');var root=document.documentElement;root.classList.toggle('dark',theme==='dark');root.style.colorScheme=theme;}catch(e){}})();`,
          }}
        />
        <Script
          defer
          src="https://abc-umami.izcgmb.easypanel.host/script.js"
          data-website-id="48e5c173-88f1-45de-85ff-3d0341ef8894"
          strategy="afterInteractive"
        />
        {/* PostHog Analytics (no-op until NEXT_PUBLIC_POSTHOG_KEY is set) */}
        {process.env.NEXT_PUBLIC_POSTHOG_KEY ? (
          <Script
            id="posthog-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSurveysLoaded onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug getPageViewId captureTraceFeedback captureTraceMetric".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);posthog.init(${JSON.stringify(process.env.NEXT_PUBLIC_POSTHOG_KEY)},{api_host:${JSON.stringify(process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com")},person_profiles:"identified_only",capture_pageview:true,capture_pageleave:true});`,
            }}
          />
        ) : null}
      </head>
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  )
}
