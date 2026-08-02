import Fastify from 'fastify';
import { IntegrationEnvSchema, parseEnv } from '@watch-bracket/config';
import { ProviderOperationSchema, type ProviderError } from '@watch-bracket/provider-contracts';

const env = parseEnv(IntegrationEnvSchema, process.env);
const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.x-integration-secret'] }, bodyLimit: 32 * 1024 });
const configured = (value?: string) => Boolean(value && !value.toLowerCase().includes('replace-me'));
const authorized = (request: { headers: Record<string, unknown> }) => request.headers['x-integration-secret'] === env.INTEGRATION_SERVICE_SHARED_SECRET;
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
  return reply.status(501).send({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: `${parsed.data.provider} operations are deliberately deferred.` } } satisfies ProviderError);
});
const close = async () => { await app.close(); process.exit(0); };
process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
await app.listen({ host: '0.0.0.0', port: env.PORT });
