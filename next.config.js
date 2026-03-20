/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    isrMemoryCacheSize: 0,
  },
}

module.exports = nextConfig
