import type { NextConfig } from 'next';
import { resolve } from 'node:path';
import { z } from 'zod';
const parsedEnv = z.object({ GAME_API_INTERNAL_URL: z.url().default('http://127.0.0.1:3001') }).safeParse(process.env);
if (!parsedEnv.success) throw new Error('Invalid web environment configuration. Check: GAME_API_INTERNAL_URL');
const api = parsedEnv.data.GAME_API_INTERNAL_URL;
const config: NextConfig = {
  output: 'standalone',
  turbopack: { root: resolve(process.cwd(), '../..') },
  async rewrites() { return [{ source: '/api/:path*', destination: `${api}/api/:path*` }, { source: '/socket.io/:path*', destination: `${api}/socket.io/:path*` }]; }
};
export default config;
