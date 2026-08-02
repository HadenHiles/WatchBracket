import { defineConfig } from 'drizzle-kit';
export default defineConfig({ schema: './src/schema.ts', out: './migrations', dialect: 'postgresql', dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://watchbracket:watchbracket@127.0.0.1:5432/watchbracket' } });
