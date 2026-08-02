import { z } from 'zod';

const secret = z.string().min(16);
const base = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),
  PUBLIC_APP_URL: z.url().default('https://bracket.famflix.live'),
  PUBLIC_ALIAS_URL: z.url().default('https://vote.famflix.live')
});

export const GameApiEnvSchema = base.extend({
  PORT: z.coerce.number().int().positive().default(3001),
  ADMIN_BOOTSTRAP_EMAIL: z.email().transform((v) => v.trim().toLowerCase()),
  ADMIN_BOOTSTRAP_PASSWORD: z.string().min(12),
  HOST_SESSION_PEPPER: secret,
  PARTICIPANT_SESSION_PEPPER: secret,
  DISPLAY_SESSION_PEPPER: secret,
  CSRF_SECRET: secret,
  INTEGRATION_SERVICE_INTERNAL_URL: z.url(),
  INTEGRATION_SERVICE_SHARED_SECRET: secret,
  ROOM_CODE_LENGTH: z.coerce.number().int().min(4).max(10).default(6),
  ROOM_MAX_PARTICIPANTS: z.coerce.number().int().min(2).max(32).default(8),
  ROOM_TTL_HOURS: z.coerce.number().positive().default(12),
  DISPLAY_PAIRING_TTL_SECONDS: z.coerce.number().int().min(30).max(300).default(300),
  CAST_LAUNCH_TOKEN_TTL_SECONDS: z.coerce.number().int().min(15).max(60).default(60)
});

export const IntegrationEnvSchema = base.pick({ NODE_ENV: true, DATABASE_URL: true }).extend({
  PORT: z.coerce.number().int().positive().default(3002),
  INTEGRATION_SERVICE_SHARED_SECRET: secret
});

export function parseEnv<T>(schema: z.ZodType<T>, env: NodeJS.ProcessEnv): T {
  const result = schema.safeParse(env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((issue) => issue.path.join('.')))].join(', ');
    throw new Error(`Invalid environment configuration. Check: ${fields}`);
  }
  return result.data;
}
