import { defineConfig } from 'tsup';
export default defineConfig({ entry: ['src/server.ts'], format: ['esm'], target: 'node22', platform: 'node', bundle: true, sourcemap: true, clean: true, noExternal: [/^@watch-bracket\//] });

