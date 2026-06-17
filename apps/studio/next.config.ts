import type { NextConfig } from 'next';

// VFOS Studio — multi-channel content coordination UI shell.
// Round UI-01: front-end shell only. No backend rewrites, no real API calls.
const config: NextConfig = {
  transpilePackages: ['@vfos/facebook'],
  experimental: {
    webpackMemoryOptimizations: true,
    cpus: 2,
    preloadEntriesOnStart: false,
  },
  webpack: (config, { dev }) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    if (dev) config.parallelism = 2;
    return config;
  },
};

// biome-ignore lint/style/noDefaultExport: Next.js config requires default export
export default config;
