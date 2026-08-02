import { resolve } from 'node:path';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from '@watch-bracket/db';
const url=process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL is required');const{db,client}=createDatabase(url,{max:1});await migrate(db,{migrationsFolder:resolve('packages/db/migrations')});await client.end();
