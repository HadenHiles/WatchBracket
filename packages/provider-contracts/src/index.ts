import { z } from 'zod';
export const ProviderSchema = z.enum(['TMDB', 'PLEX', 'TAUTULLI', 'SEERR']);
export const ProviderOperationSchema = z.object({ provider: ProviderSchema, operation: z.string().min(1), input: z.record(z.string(), z.unknown()) });
export const ProviderErrorSchema = z.object({ ok: z.literal(false), error: z.object({ code: z.enum(['NOT_CONFIGURED', 'NOT_IMPLEMENTED']), message: z.string() }) });
export type ProviderError = z.infer<typeof ProviderErrorSchema>;

