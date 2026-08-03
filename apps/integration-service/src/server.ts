import Fastify from 'fastify';
import { IntegrationEnvSchema, parseEnv } from '@watch-bracket/config';
import { createDatabase } from '@watch-bracket/db';
import { ProviderOperationSchema, type ProviderError } from '@watch-bracket/provider-contracts';
import { TmdbProvider, TmdbProviderError, tmdbMetadataTtlMs } from './tmdb.js';
import { IntegrationProviderError, PlexProvider, SeerrProvider, TautulliProvider } from './integrations.js';
import { ParticipantPlexAccounts } from './plex-account.js';

const env = parseEnv(IntegrationEnvSchema, process.env);
const database = createDatabase(env.DATABASE_URL, { max: 3 });
const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.x-integration-secret'] }, bodyLimit: 32 * 1024 });
const configured = (value?: string) => Boolean(value && !value.toLowerCase().includes('replace-me'));
const authorized = (request: { headers: Record<string, unknown> }) => request.headers['x-integration-secret'] === env.INTEGRATION_SERVICE_SHARED_SECRET;
const tmdb = new TmdbProvider(env.TMDB_API_READ_TOKEN);
const plex = new PlexProvider(env.PLEX_BASE_URL, env.PLEX_TOKEN);
const tautulli = new TautulliProvider(env.TAUTULLI_BASE_URL, env.TAUTULLI_API_KEY);
const seerr = new SeerrProvider(env.SEERR_BASE_URL, env.SEERR_API_KEY, env.SEERR_PUBLIC_URL);
const participantPlex = new ParticipantPlexAccounts(database.db, env.INTEGRATION_SERVICE_SHARED_SECRET);
app.get('/internal/health/live', async () => ({ status: 'ok' }));
app.get('/internal/health/ready', async () => ({ status: 'ready' }));
app.get('/internal/setup/status', async (request, reply) => {
  if (!authorized(request)) return reply.status(401).send({ ok: false });
  const probe = async (provider: { configured: boolean; health(): Promise<boolean>; circuit: 'OPEN' | 'CLOSED' }) => {
    if (!provider.configured) return { configured: false, healthy: false, circuit: provider.circuit };
    try { await provider.health(); return { configured: true, healthy: true, circuit: provider.circuit }; }
    catch { return { configured: true, healthy: false, circuit: provider.circuit }; }
  };
  const [plexStatus, tautulliStatus, seerrStatus] = await Promise.all([probe(plex), probe(tautulli), probe(seerr)]);
  return { providers: {
    TMDB: { configured: configured(env.TMDB_API_READ_TOKEN), requiredVariables: ['TMDB_API_READ_TOKEN'] },
    PLEX: { ...plexStatus, requiredVariables: ['PLEX_BASE_URL', 'PLEX_TOKEN'] },
    TAUTULLI: { ...tautulliStatus, requiredVariables: ['TAUTULLI_BASE_URL', 'TAUTULLI_API_KEY'] },
    SEERR: { ...seerrStatus, requiredVariables: ['SEERR_BASE_URL', 'SEERR_PUBLIC_URL', 'SEERR_API_KEY'] }
  } };
});
app.post('/internal/providers/operation', async (request, reply) => {
  if (!authorized(request)) return reply.status(401).send({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'Internal authorization failed.' } } satisfies ProviderError);
  const parsed = ProviderOperationSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'Invalid provider operation.' } } satisfies ProviderError);
  try {
    const cachedUntil = new Date(Date.now() + tmdbMetadataTtlMs).toISOString();
    if (parsed.data.operation === 'SEARCH') return { ok: true, provider: 'TMDB', operation: 'SEARCH', items: await tmdb.search({ ...parsed.data.input, mediaType: parsed.data.input.mediaType }), cachedUntil };
    if (parsed.data.operation === 'RECOMMENDATIONS') return { ok: true, provider: 'TMDB', operation: 'RECOMMENDATIONS', candidates: await tmdb.recommendations(parsed.data.input), cachedUntil };
    if (parsed.data.operation === 'DETAILS') return { ok: true, provider: 'TMDB', operation: 'DETAILS', item: await tmdb.details(parsed.data.input.mediaType, parsed.data.input.tmdbId, parsed.data.input.region, parsed.data.input.language), cachedUntil };
    if (parsed.data.operation === 'HEALTH') {
      const provider = parsed.data.provider === 'PLEX' ? plex : parsed.data.provider === 'TAUTULLI' ? tautulli : seerr;
      await provider.health(); return { ok: true, provider: parsed.data.provider, operation: 'HEALTH', healthy: true, circuit: provider.circuit };
    }
    if (parsed.data.operation === 'PLEX_INVENTORY') return { ok: true, provider: 'PLEX', operation: 'PLEX_INVENTORY', ...await plex.inventory(parsed.data.input.libraryIds) };
    if (parsed.data.operation === 'PLEX_AUTH_START') return { ok: true, provider: 'PLEX', operation: 'PLEX_AUTH_START', ...await participantPlex.start(parsed.data.input.participantId, parsed.data.input.forwardUrl) };
    if (parsed.data.operation === 'PLEX_AUTH_STATUS') return { ok: true, provider: 'PLEX', operation: 'PLEX_AUTH_STATUS', ...await participantPlex.status(parsed.data.input.participantId) };
    if (parsed.data.operation === 'PLEX_WATCHLIST') {
      const input = parsed.data.input;
      const references = await participantPlex.watchlist(input.participantId, input.limit);
      const items = (await Promise.allSettled(references.map((item) => tmdb.details(item.mediaType, item.tmdbId, input.region, input.language))))
        .flatMap((result) => result.status === 'fulfilled' ? [result.value] : []);
      return { ok: true, provider: 'PLEX', operation: 'PLEX_WATCHLIST', items, refreshedAt: new Date().toISOString() };
    }
    if (parsed.data.operation === 'PLEX_GROUP_PREFERENCES') {
      const input = parsed.data.input;
      const participants = (await Promise.all(input.participantIds.map(async (participantId) => {
        try {
          const items = await participantPlex.watchlist(participantId, input.limitPerParticipant);
          return { participantId, items: items.map(({ tmdbId, mediaType }) => ({ tmdbId, mediaType })) };
        } catch (error) {
          if (error instanceof IntegrationProviderError && error.code === 'NOT_CONFIGURED') return { participantId, items: [] };
          throw error;
        }
      }))).filter((participant) => participant.items.length > 0);
      return { ok: true, provider: 'PLEX', operation: 'PLEX_GROUP_PREFERENCES', participants, refreshedAt: new Date().toISOString() };
    }
    if (parsed.data.operation === 'PLEX_UNLINK') return { ok: true, provider: 'PLEX', operation: 'PLEX_UNLINK', ...await participantPlex.unlink(parsed.data.input.participantId) };
    if (parsed.data.operation === 'TAUTULLI_HISTORY') return { ok: true, provider: 'TAUTULLI', operation: 'TAUTULLI_HISTORY', ...await tautulli.history(parsed.data.input.limit) };
    return { ok: true, provider: 'SEERR', operation: 'SEERR_STATUS', items: await seerr.statuses(parsed.data.input.items) };
  } catch (error) {
    const providerError = error instanceof TmdbProviderError || error instanceof IntegrationProviderError ? error : new IntegrationProviderError('UPSTREAM_ERROR', 'Provider operation failed.');
    const status = providerError.code === 'NOT_CONFIGURED' ? 503 : providerError.code === 'UPSTREAM_TIMEOUT' ? 504 : 502;
    return reply.status(status).send({ ok: false, error: { code: providerError.code, message: providerError.message } } satisfies ProviderError);
  }
});
const inventoryTimer = setInterval(() => { if (plex.configured) void plex.inventory(undefined, true).catch((error) => app.log.warn({ err: error }, 'scheduled Plex inventory refresh failed')); }, 30 * 60_000);
inventoryTimer.unref();
if (plex.configured) void plex.inventory(undefined, true).catch((error) => app.log.warn({ err: error }, 'initial Plex inventory refresh failed'));
const close = async () => { await app.close(); await database.client.end(); process.exit(0); };
process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
await app.listen({ host: '0.0.0.0', port: env.PORT });
