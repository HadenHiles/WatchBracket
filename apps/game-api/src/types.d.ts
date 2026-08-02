import type { Database } from '@watch-bracket/db';
declare module 'fastify' { interface FastifyInstance { db: Database } }

