import Fastify from 'fastify';
import { IntegrationEnvSchema, parseEnv } from '@watch-bracket/config';
import { ProviderOperationSchema, type ProviderError } from '@watch-bracket/provider-contracts';
import { TmdbProvider, TmdbProviderError, tmdbMetadataTtlMs } from './tmdb.js';

const env = parseEnv(IntegrationEnvSchema, process.env);
const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.x-integration-secret'] }, bodyLimit: 32 * 1024 });
const configured = (value?: string) => Boolean(value && !value.toLowerCase().includes('replace-me'));
const authorized = (request: { headers: Record<string, unknown> }) => request.headers['x-integration-secret'] === env.INTEGRATION_SERVICE_SHARED_SECRET;
const tmdb = new TmdbProvider(env.TMDB_API_READ_TOKEN);
app.get('/internal/health/live', async () => ({ status: 'ok' }));
app.get('/internal/health/ready', async () => ({ status: 'ready' }));
app.get('/internal/setup/status', async (request, reply) => {
  if (!authorized(request)) return reply.status(401).send({ ok: false });
  return { providers: {
    TMDB: { configured: configured(env.TMDB_API_READ_TOKEN), requiredVariables: ['TMDB_API_READ_TOKEN'] },
    PLEX: { configured: configured(env.PLEX_BASE_URL) && configured(env.PLEX_TOKEN), requiredVariables: ['PLEX_BASE_URL', 'PLEX_TOKEN'] },
    TAUTULLI: { configured: configured(env.TAUTULLI_BASE_URL) && configured(env.TAUTULLI_API_KEY), requiredVariables: ['TAUTULLI_BASE_URL', 'TAUTULLI_API_KEY'] },
    SEERR: { configured: configured(env.SEERR_BASE_URL) && configured(env.SEERR_API_KEY), requiredVariables: ['SEERR_BASE_URL', 'SEERR_API_KEY'] }
  } };
});
app.post('/internal/providers/operation', async (request, reply) => {
  if (!authorized(request)) return reply.status(401).send({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'Internal authorization failed.' } } satisfies ProviderError);
  const parsed = ProviderOperationSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'Invalid provider operation.' } } satisfies ProviderError);
  try {
    const cachedUntil = new Date(Date.now() + tmdbMetadataTtlMs).toISOString();
    if (parsed.data.operation === 'SEARCH') return { ok: true, provider: 'TMDB', operation: 'SEARCH', items: await tmdb.search({ ...parsed.data.input, mediaType: parsed.data.input.mediaType }), cachedUntil };
    return { ok: true, provider: 'TMDB', operation: 'RECOMMENDATIONS', candidates: await tmdb.recommendations(parsed.data.input), cachedUntil };
  } catch (error) {
    const providerError = error instanceof TmdbProviderError ? error : new TmdbProviderError('UPSTREAM_ERROR', 'TMDB operation failed.');
    const status = providerError.code === 'NOT_CONFIGURED' ? 503 : providerError.code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
    return reply.status(status).send({ ok: false, error: { code: providerError.code, message: providerError.message } } satisfies ProviderError);
  }
});
const close = async () => { await app.close(); process.exit(0); };
process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
await app.listen({ host: '0.0.0.0', port: env.PORT });
