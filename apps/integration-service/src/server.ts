import Fastify from 'fastify';
import { IntegrationEnvSchema, parseEnv } from '@watch-bracket/config';
import { ProviderOperationSchema, type ProviderError } from '@watch-bracket/provider-contracts';

const env = parseEnv(IntegrationEnvSchema, process.env);
const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.x-integration-secret'] }, bodyLimit: 32 * 1024 });
app.get('/internal/health/live', async () => ({ status: 'ok' }));
app.get('/internal/health/ready', async () => ({ status: 'ready' }));
app.post('/internal/providers/operation', async (request, reply) => {
  if (request.headers['x-integration-secret'] !== env.INTEGRATION_SERVICE_SHARED_SECRET) return reply.status(401).send({ ok: false, error: { code: 'NOT_CONFIGURED', message: 'Internal authorization failed.' } } satisfies ProviderError);
  const parsed = ProviderOperationSchema.safeParse(request.body);
  if (!parsed.success) return reply.status(400).send({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: 'Invalid provider operation.' } } satisfies ProviderError);
  return reply.status(501).send({ ok: false, error: { code: 'NOT_IMPLEMENTED', message: `${parsed.data.provider} operations are deliberately deferred.` } } satisfies ProviderError);
});
const close = async () => { await app.close(); process.exit(0); };
process.once('SIGINT', () => void close()); process.once('SIGTERM', () => void close());
await app.listen({ host: '0.0.0.0', port: env.PORT });

