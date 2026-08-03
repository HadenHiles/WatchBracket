import { PlexAuthStartResultSchema, PlexAuthStatusResultSchema, PlexGroupPreferencesResultSchema, PlexInventoryResultSchema, PlexUnlinkResultSchema, PlexWatchlistResultSchema, SeerrRequestResultSchema, SeerrStatusResultSchema, TautulliHistoryResultSchema, TmdbDetailsResultSchema, TmdbRecommendationsResultSchema, TmdbSearchResultSchema, type CanonicalMediaItem, type ProviderOperation, type RecommendationCandidate } from '@watch-bracket/provider-contracts';
import type { DomainContext } from './domain.js';
import { DomainError } from './domain.js';

async function operation(ctx: DomainContext, body: ProviderOperation): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(new URL('/internal/providers/operation', ctx.env.INTEGRATION_SERVICE_INTERNAL_URL), {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-integration-secret': ctx.env.INTEGRATION_SERVICE_SHARED_SECRET },
      body: JSON.stringify(body), signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new DomainError('CATALOG_UNAVAILABLE', 'The media catalog is temporarily unavailable.', 503);
  }
  const payload: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'error' in payload && typeof payload.error === 'object' && payload.error && 'message' in payload.error && typeof payload.error.message === 'string' ? payload.error.message : 'The media catalog is temporarily unavailable.';
    throw new DomainError('CATALOG_UNAVAILABLE', message, 503);
  }
  return payload;
}

export async function searchTmdb(ctx: DomainContext, input: { query: string; mediaType: 'MOVIE' | 'TV' | undefined; region?: string; limit?: number }): Promise<{ items: CanonicalMediaItem[]; cachedUntil: string }> {
  const limit = input.limit ?? 12;
  const searchInput = input.mediaType ? { query: input.query, mediaType: input.mediaType, region: input.region ?? 'CA', language: 'en-CA' as const, limit } : { query: input.query, region: input.region ?? 'CA', language: 'en-CA' as const, limit };
  const payload = await operation(ctx, { provider: 'TMDB', operation: 'SEARCH', input: searchInput });
  const parsed = TmdbSearchResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('CATALOG_INVALID_RESPONSE', 'The media catalog returned an invalid response.', 502);
  return { items: parsed.data.items, cachedUntil: parsed.data.cachedUntil };
}

export async function recommendFromTmdb(ctx: DomainContext, input: { seeds: Array<{ tmdbId: number; mediaType: 'MOVIE' | 'TV' }>; region?: string; limit: number }): Promise<{ candidates: RecommendationCandidate[]; cachedUntil: string }> {
  const payload = await operation(ctx, { provider: 'TMDB', operation: 'RECOMMENDATIONS', input: { seeds: input.seeds, region: input.region ?? 'CA', language: 'en-CA', limit: input.limit } });
  const parsed = TmdbRecommendationsResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('RECOMMENDATIONS_INVALID_RESPONSE', 'The recommendation provider returned an invalid response.', 502);
  return { candidates: parsed.data.candidates, cachedUntil: parsed.data.cachedUntil };
}

export async function detailsFromTmdb(ctx: DomainContext, input: { tmdbId: number; mediaType: 'MOVIE' | 'TV'; region?: string }) {
  const region = input.region ?? 'CA';
  const payload = await operation(ctx, { provider: 'TMDB', operation: 'DETAILS', input: { tmdbId: input.tmdbId, mediaType: input.mediaType, region, language: `en-${region}` } });
  const parsed = TmdbDetailsResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('CATALOG_INVALID_RESPONSE', 'The media catalog returned invalid title details.', 502);
  return parsed.data;
}

export async function enrichWithHouseholdProviders(ctx: DomainContext, items: CanonicalMediaItem[]): Promise<CanonicalMediaItem[]> {
  if (!items.length) return items;
  const [plexPayload, seerrPayload, historyPayload] = await Promise.all([
    operation(ctx, { provider: 'PLEX', operation: 'PLEX_INVENTORY', input: {} }).catch(() => undefined),
    operation(ctx, { provider: 'SEERR', operation: 'SEERR_STATUS', input: { items: items.map(({ tmdbId, mediaType }) => ({ tmdbId, mediaType })) } }).catch(() => undefined),
    operation(ctx, { provider: 'TAUTULLI', operation: 'TAUTULLI_HISTORY', input: { limit: 500 } }).catch(() => undefined)
  ]);
  const inventory = PlexInventoryResultSchema.safeParse(plexPayload);
  const statuses = SeerrStatusResultSchema.safeParse(seerrPayload);
  const history = TautulliHistoryResultSchema.safeParse(historyPayload);
  return items.map((item) => {
    const local = inventory.success ? inventory.data.items.find((entry) => entry.tmdbId === item.tmdbId && entry.mediaType === item.mediaType) : undefined;
    const request = statuses.success ? statuses.data.items.find((entry) => entry.tmdbId === item.tmdbId && entry.mediaType === item.mediaType) : undefined;
    const watched = history.success ? history.data.items.find((entry) => entry.tmdbId === item.tmdbId && (!entry.mediaType || entry.mediaType === item.mediaType)) : undefined;
    return {
      ...item,
      ...(local ? { localAvailability: { available: true, plexUrl: local.plexUrl, libraryTitle: local.libraryTitle, episodeCount: local.episodeCount } } : {}),
      ...(request ? { requestAvailability: { status: request.status, requestable: request.requestable, requestUrl: request.requestUrl } } : {}),
      ...(watched ? { householdHistoryScore: watched.playCount } : {})
    };
  });
}

export async function getPlexInventory(ctx: DomainContext) {
  const payload = await operation(ctx, { provider: 'PLEX', operation: 'PLEX_INVENTORY', input: {} });
  const parsed = PlexInventoryResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('PLEX_INVALID_RESPONSE', 'Plex returned an invalid library inventory.', 502);
  return parsed.data;
}

export async function requestFromSeerr(ctx: DomainContext, input: { tmdbId: number; mediaType: 'MOVIE' | 'TV'; tvSeasonPolicy?: 'FIRST' | 'LATEST' | 'ALL' }) {
  const payload = await operation(ctx, { provider: 'SEERR', operation: 'SEERR_REQUEST', input });
  const parsed = SeerrRequestResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('SEERR_INVALID_RESPONSE', 'The request service returned an invalid response.', 502);
  return parsed.data;
}

export async function startPlexAuth(ctx: DomainContext, participantId: string, forwardUrl: string) {
  const payload = await operation(ctx, { provider: 'PLEX', operation: 'PLEX_AUTH_START', input: { participantId, forwardUrl } });
  const parsed = PlexAuthStartResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('PLEX_INVALID_RESPONSE', 'Plex returned an invalid sign-in response.', 502);
  return parsed.data;
}

export async function getPlexAuthStatus(ctx: DomainContext, participantId: string) {
  const payload = await operation(ctx, { provider: 'PLEX', operation: 'PLEX_AUTH_STATUS', input: { participantId } });
  const parsed = PlexAuthStatusResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('PLEX_INVALID_RESPONSE', 'Plex returned an invalid account response.', 502);
  return parsed.data;
}

export async function getPlexWatchlist(ctx: DomainContext, participantId: string, region = 'CA') {
  const payload = await operation(ctx, { provider: 'PLEX', operation: 'PLEX_WATCHLIST', input: { participantId, region, language: `en-${region}`, limit: 16 } });
  const parsed = PlexWatchlistResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('PLEX_INVALID_RESPONSE', 'Plex returned an invalid watchlist.', 502);
  return parsed.data;
}

export async function getGroupPlexPreferences(ctx: DomainContext, participantIds: string[]) {
  if (!participantIds.length) return { participants: [], refreshedAt: new Date().toISOString() };
  const payload = await operation(ctx, { provider: 'PLEX', operation: 'PLEX_GROUP_PREFERENCES', input: { participantIds, limitPerParticipant: 8 } });
  const parsed = PlexGroupPreferencesResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('PLEX_INVALID_RESPONSE', 'Plex returned invalid group preferences.', 502);
  return parsed.data;
}

export async function getTautulliHistory(ctx: DomainContext, limit = 500) {
  const payload = await operation(ctx, { provider: 'TAUTULLI', operation: 'TAUTULLI_HISTORY', input: { limit } });
  const parsed = TautulliHistoryResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('TAUTULLI_INVALID_RESPONSE', 'Tautulli returned invalid viewing history.', 502);
  return parsed.data;
}

export async function unlinkPlex(ctx: DomainContext, participantId: string) {
  const payload = await operation(ctx, { provider: 'PLEX', operation: 'PLEX_UNLINK', input: { participantId } });
  const parsed = PlexUnlinkResultSchema.safeParse(payload);
  if (!parsed.success) throw new DomainError('PLEX_INVALID_RESPONSE', 'Plex returned an invalid unlink response.', 502);
  return parsed.data;
}
