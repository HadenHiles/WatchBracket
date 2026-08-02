import { z } from 'zod';

export const ProviderSchema = z.enum(['TMDB', 'PLEX', 'TAUTULLI', 'SEERR']);
export const MediaTypeSchema = z.enum(['MOVIE', 'TV']);
export const AvailabilityCategorySchema = z.enum(['SUBSCRIPTION', 'FREE', 'ADS', 'RENT', 'BUY']);

export const AvailabilityOfferSchema = z.object({
  providerId: z.number().int().positive(),
  providerName: z.string().min(1),
  logoUrl: z.url().nullable(),
  category: AvailabilityCategorySchema
});

export const MediaAvailabilitySchema = z.object({
  region: z.string().length(2),
  link: z.url().nullable(),
  attribution: z.literal('JustWatch'),
  offers: z.array(AvailabilityOfferSchema)
});

export const CanonicalMediaItemSchema = z.object({
  catalogKey: z.string().regex(/^tmdb:(MOVIE|TV):\d+$/),
  tmdbId: z.number().int().positive(),
  mediaType: MediaTypeSchema,
  title: z.string().min(1),
  originalTitle: z.string().min(1),
  releaseDate: z.string().nullable(),
  releaseYear: z.number().int().min(1870).max(2200),
  runtimeMinutes: z.number().int().positive().nullable(),
  contentRating: z.string().nullable(),
  genres: z.array(z.string()),
  synopsis: z.string(),
  posterUrl: z.url().nullable(),
  backdropUrl: z.url().nullable(),
  popularity: z.number().nonnegative(),
  voteAverage: z.number().min(0).max(10),
  voteCount: z.number().int().nonnegative(),
  adult: z.boolean(),
  availability: MediaAvailabilitySchema
});

export const RecommendationCandidateSchema = z.object({
  item: CanonicalMediaItemSchema,
  relatedSeedKeys: z.array(z.string()).min(1),
  sourceKinds: z.array(z.enum(['RECOMMENDATIONS', 'SIMILAR', 'DISCOVER'])).min(1)
});

const TmdbCommonInputSchema = z.object({
  region: z.string().length(2).default('CA'),
  language: z.string().min(2).max(16).default('en-CA')
});

export const TmdbSearchOperationSchema = z.object({
  provider: z.literal('TMDB'),
  operation: z.literal('SEARCH'),
  input: TmdbCommonInputSchema.extend({
    query: z.string().trim().min(1).max(100),
    mediaType: MediaTypeSchema.optional(),
    limit: z.number().int().min(1).max(12).default(12)
  })
});

export const TmdbRecommendationsOperationSchema = z.object({
  provider: z.literal('TMDB'),
  operation: z.literal('RECOMMENDATIONS'),
  input: TmdbCommonInputSchema.extend({
    seeds: z.array(z.object({ tmdbId: z.number().int().positive(), mediaType: MediaTypeSchema })).min(1).max(16),
    limit: z.number().int().min(1).max(48).default(32)
  })
});

export const ProviderOperationSchema = z.discriminatedUnion('operation', [TmdbSearchOperationSchema, TmdbRecommendationsOperationSchema]);
export const TmdbSearchResultSchema = z.object({ ok: z.literal(true), provider: z.literal('TMDB'), operation: z.literal('SEARCH'), items: z.array(CanonicalMediaItemSchema), cachedUntil: z.iso.datetime() });
export const TmdbRecommendationsResultSchema = z.object({ ok: z.literal(true), provider: z.literal('TMDB'), operation: z.literal('RECOMMENDATIONS'), candidates: z.array(RecommendationCandidateSchema), cachedUntil: z.iso.datetime() });
export const ProviderSuccessSchema = z.union([TmdbSearchResultSchema, TmdbRecommendationsResultSchema]);
export const ProviderErrorSchema = z.object({ ok: z.literal(false), error: z.object({ code: z.enum(['NOT_CONFIGURED', 'NOT_IMPLEMENTED', 'UPSTREAM_ERROR', 'UPSTREAM_TIMEOUT', 'INVALID_RESPONSE']), message: z.string() }) });

export type CanonicalMediaItem = z.infer<typeof CanonicalMediaItemSchema>;
export type RecommendationCandidate = z.infer<typeof RecommendationCandidateSchema>;
export type ProviderOperation = z.infer<typeof ProviderOperationSchema>;
export type ProviderError = z.infer<typeof ProviderErrorSchema>;
