import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/server.ts', 'src/migrate.ts'], format: ['esm'], target: 'node22', platform: 'node', bundle: true, splitting: false, sourcemap: true, clean: true, noExternal: [/^@watch-bracket\//] });

