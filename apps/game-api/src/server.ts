import { buildApp } from './app.js';
import { loadEnv } from './env.js';

const env = loadEnv();
const app = await buildApp(env);
const shutdown = async (signal: string) => { app.log.info({ signal }, 'shutting down'); await app.close(); process.exit(0); };
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));
await app.listen({ host: '0.0.0.0', port: env.PORT });

