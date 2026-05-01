/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Reverse-proxy the ops workspace so the iframe at /operations is
  // same-origin with services-dashboard. Avoids cross-site cookie
  // problems entirely — NocoDB's session cookie is treated as first-party.
  async rewrites() {
    return [
      {
        source: '/embed-ops',
        destination: 'https://ops.ancsports.net',
      },
      {
        source: '/embed-ops/:path*',
        destination: 'https://ops.ancsports.net/:path*',
      },
    ]
  },
}

module.exports = nextConfig
