import type { NextConfig } from "next";
import { resolve } from "node:path";
import { z } from "zod";
const parsedEnv = z
  .object({ GAME_API_INTERNAL_URL: z.url().default("http://127.0.0.1:3001") })
  .safeParse(process.env);
if (!parsedEnv.success)
  throw new Error(
    "Invalid web environment configuration. Check: GAME_API_INTERNAL_URL",
  );
const api = parsedEnv.data.GAME_API_INTERNAL_URL;
const castReceiverAppId = process.env.CAST_RECEIVER_APP_ID?.trim() ?? "";
const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'"} https://www.gstatic.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://image.tmdb.org",
  "connect-src 'self'",
  "font-src 'self'",
  ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
].join("; ");
const config: NextConfig = {
  output: "standalone",
  turbopack: { root: resolve(process.cwd(), "../..") },
  env: { NEXT_PUBLIC_CAST_RECEIVER_APP_ID: castReceiverAppId },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${api}/api/:path*` },
      { source: "/socket.io/:path*", destination: `${api}/socket.io/:path*` },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};
export default config;
