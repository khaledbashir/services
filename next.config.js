/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    // ssh2 / ssh2-sftp-client use dynamic requires and optional native bindings
    // that webpack can't bundle — keep them external so they're required from
    // node_modules at runtime (used by the proof-ftp browse/stream routes).
    serverComponentsExternalPackages: ['ssh2', 'ssh2-sftp-client'],
  },
}

module.exports = nextConfig
