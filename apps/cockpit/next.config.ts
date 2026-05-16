import type { NextConfig } from 'next';

// /api/kernel/* is proxied by src/app/api/kernel/[...path]/route.ts which
// injects the admin Bearer token. No rewrite needed — the route handler
// gives us a single place to enforce auth + override headers.
const config: NextConfig = {};

export default config;
