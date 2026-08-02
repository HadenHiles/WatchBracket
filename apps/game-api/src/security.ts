import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { generateSessionToken } from '@watch-bracket/shared';
import type { GameApiEnv } from './env.js';

export const COOKIE = { host: 'wb_host', participant: 'wb_participant', display: 'wb_display', csrf: 'wb_csrf' } as const;

function signature(nonce: string, secret: string) { return createHmac('sha256', secret).update(nonce).digest('base64url'); }
export function issueCsrf(reply: FastifyReply, env: GameApiEnv): string {
  const nonce = generateSessionToken();
  const value = `${nonce}.${signature(nonce, env.CSRF_SECRET)}`;
  reply.setCookie(COOKIE.csrf, value, cookieOptions(env, false, 60 * 60 * 24));
  return value;
}
export function verifyCsrf(request: FastifyRequest, env: GameApiEnv): boolean {
  const cookie = request.cookies[COOKIE.csrf];
  const header = request.headers['x-csrf-token'];
  if (!cookie || typeof header !== 'string' || cookie !== header) return false;
  const splitAt = cookie.lastIndexOf('.');
  if (splitAt < 1) return false;
  const nonce = cookie.slice(0, splitAt);
  const actual = Buffer.from(cookie.slice(splitAt + 1));
  const expected = Buffer.from(signature(nonce, env.CSRF_SECRET));
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function allowedOrigin(origin: string | undefined, env: GameApiEnv): boolean {
  if (!origin) return env.NODE_ENV === 'test';
  const allowed = new Set([new URL(env.PUBLIC_APP_URL).origin, 'http://localhost:3000', 'http://127.0.0.1:3000']);
  return allowed.has(origin);
}
export function cookieOptions(env: GameApiEnv, httpOnly = true, maxAge = 60 * 60 * 24 * 7) {
  return { path: '/', httpOnly, secure: env.NODE_ENV === 'production', sameSite: 'lax' as const, maxAge };
}

