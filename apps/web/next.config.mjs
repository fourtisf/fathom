/** @type {import('next').NextConfig} */
const API_URL = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4200';

const nextConfig = {
  // Deploys build into a separate folder and swap it in at the end, so the running site never serves
  // pages whose CSS/JS were deleted mid-build (see deploy/deploy.sh).
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  poweredByHeader: false,
  // Streaming chat (SSE) is proxied through the /api rewrite; compression would buffer it. Nginx can gzip instead.
  compress: false,
  transpilePackages: ['@fathom/config'],
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_URL}/:path*` }];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=(), interest-cohort=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
