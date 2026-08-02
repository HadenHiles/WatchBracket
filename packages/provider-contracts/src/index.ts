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
  availability: MediaAvailabilitySchema,
  localAvailability: z.object({
    available: z.boolean(),
    plexUrl: z.url().nullable(),
    libraryTitle: z.string().nullable(),
    episodeCount: z.number().int().nonnegative().nullable()
  }).optional(),
  requestAvailability: z.object({
    status: z.enum(['UNKNOWN', 'PENDING', 'PROCESSING', 'PARTIAL', 'AVAILABLE', 'REQUESTABLE', 'UNAVAILABLE']),
    requestable: z.boolean()
  }).optional(),
  householdHistoryScore: z.number().nonnegative().optional()
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

export const ProviderHealthOperationSchema = z.object({
  provider: z.enum(['PLEX', 'TAUTULLI', 'SEERR']),
  operation: z.literal('HEALTH'),
  input: z.object({})
});

export const PlexInventoryOperationSchema = z.object({
  provider: z.literal('PLEX'),
  operation: z.literal('PLEX_INVENTORY'),
  input: z.object({ libraryIds: z.array(z.string().min(1)).max(50).optional() })
});

export const TautulliHistoryOperationSchema = z.object({
  provider: z.literal('TAUTULLI'),
  operation: z.literal('TAUTULLI_HISTORY'),
  input: z.object({ limit: z.number().int().min(1).max(1000).default(500) })
});

export const SeerrStatusOperationSchema = z.object({
  provider: z.literal('SEERR'),
  operation: z.literal('SEERR_STATUS'),
  input: z.object({ items: z.array(z.object({ tmdbId: z.number().int().positive(), mediaType: MediaTypeSchema })).max(48) })
});

export const SeerrRequestOperationSchema = z.object({
  provider: z.literal('SEERR'),
  operation: z.literal('SEERR_REQUEST'),
  input: z.object({
    tmdbId: z.number().int().positive(),
    mediaType: MediaTypeSchema,
    tvSeasonPolicy: z.enum(['FIRST', 'LATEST', 'ALL']).optional()
  }).superRefine((value, context) => {
    if (value.mediaType === 'TV' && !value.tvSeasonPolicy) context.addIssue({ code: 'custom', path: ['tvSeasonPolicy'], message: 'TV requests require a season policy.' });
  })
});

export const ProviderOperationSchema = z.discriminatedUnion('operation', [TmdbSearchOperationSchema, TmdbRecommendationsOperationSchema, ProviderHealthOperationSchema, PlexInventoryOperationSchema, TautulliHistoryOperationSchema, SeerrStatusOperationSchema, SeerrRequestOperationSchema]);
export const TmdbSearchResultSchema = z.object({ ok: z.literal(true), provider: z.literal('TMDB'), operation: z.literal('SEARCH'), items: z.array(CanonicalMediaItemSchema), cachedUntil: z.iso.datetime() });
export const TmdbRecommendationsResultSchema = z.object({ ok: z.literal(true), provider: z.literal('TMDB'), operation: z.literal('RECOMMENDATIONS'), candidates: z.array(RecommendationCandidateSchema), cachedUntil: z.iso.datetime() });
export const ProviderHealthResultSchema = z.object({ ok: z.literal(true), operation: z.literal('HEALTH'), provider: z.enum(['PLEX', 'TAUTULLI', 'SEERR']), healthy: z.boolean(), circuit: z.enum(['CLOSED', 'OPEN']) });
export const PlexInventoryItemSchema = z.object({ tmdbId: z.number().int().positive().nullable(), mediaType: MediaTypeSchema, ratingKey: z.string(), title: z.string(), year: z.number().int().nullable(), libraryId: z.string(), libraryTitle: z.string(), plexUrl: z.url().nullable(), episodeCount: z.number().int().nonnegative().nullable() });
export const PlexInventoryResultSchema = z.object({ ok: z.literal(true), provider: z.literal('PLEX'), operation: z.literal('PLEX_INVENTORY'), libraries: z.array(z.object({ id: z.string(), title: z.string(), mediaType: MediaTypeSchema })), items: z.array(PlexInventoryItemSchema), refreshedAt: z.iso.datetime() });
export const TautulliHistoryResultSchema = z.object({ ok: z.literal(true), provider: z.literal('TAUTULLI'), operation: z.literal('TAUTULLI_HISTORY'), items: z.array(z.object({ tmdbId: z.number().int().positive().nullable(), mediaType: MediaTypeSchema.nullable(), title: z.string(), playCount: z.number().int().nonnegative(), lastWatchedAt: z.iso.datetime().nullable() })), refreshedAt: z.iso.datetime() });
export const SeerrStatusSchema = z.enum(['UNKNOWN', 'PENDING', 'PROCESSING', 'PARTIAL', 'AVAILABLE', 'REQUESTABLE', 'UNAVAILABLE']);
export const SeerrStatusResultSchema = z.object({ ok: z.literal(true), provider: z.literal('SEERR'), operation: z.literal('SEERR_STATUS'), items: z.array(z.object({ tmdbId: z.number().int().positive(), mediaType: MediaTypeSchema, status: SeerrStatusSchema, requestable: z.boolean() })) });
export const SeerrRequestResultSchema = z.object({ ok: z.literal(true), provider: z.literal('SEERR'), operation: z.literal('SEERR_REQUEST'), requestId: z.number().int().positive(), status: SeerrStatusSchema });
export const ProviderSuccessSchema = z.union([TmdbSearchResultSchema, TmdbRecommendationsResultSchema, ProviderHealthResultSchema, PlexInventoryResultSchema, TautulliHistoryResultSchema, SeerrStatusResultSchema, SeerrRequestResultSchema]);
export const ProviderErrorSchema = z.object({ ok: z.literal(false), error: z.object({ code: z.enum(['NOT_CONFIGURED', 'NOT_IMPLEMENTED', 'UPSTREAM_ERROR', 'UPSTREAM_TIMEOUT', 'INVALID_RESPONSE', 'CIRCUIT_OPEN', 'ALREADY_REQUESTED']), message: z.string() }) });

export type CanonicalMediaItem = z.infer<typeof CanonicalMediaItemSchema>;
export type RecommendationCandidate = z.infer<typeof RecommendationCandidateSchema>;
export type ProviderOperation = z.infer<typeof ProviderOperationSchema>;
export type ProviderError = z.infer<typeof ProviderErrorSchema>;
