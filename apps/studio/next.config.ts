import type { NextConfig } from 'next';

// VFOS Studio — multi-channel content coordination UI shell.
// Round UI-01: front-end shell only. No backend rewrites, no real API calls.
const config: NextConfig = {
  transpilePackages: ['@vfos/facebook'],
  webpack: (config) => {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
    };
    return config;
  },
};

// biome-ignore lint/style/noDefaultExport: Next.js config requires default export
export default config;
