import { GameApiEnvSchema, parseEnv } from '@watch-bracket/config';
export type GameApiEnv = ReturnType<typeof loadEnv>;
export const loadEnv = (source: NodeJS.ProcessEnv = process.env) => parseEnv(GameApiEnvSchema, source);

