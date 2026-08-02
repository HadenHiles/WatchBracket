import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from './index.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const { db, client } = createDatabase(url, { max: 1 });
await migrate(db, { migrationsFolder: new URL('../migrations', import.meta.url).pathname });
await client.end();
