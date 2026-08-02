import { TmdbRecommendationsResultSchema, TmdbSearchResultSchema, type CanonicalMediaItem, type ProviderOperation, type RecommendationCandidate } from '@watch-bracket/provider-contracts';
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

export async function searchTmdb(ctx: DomainContext, input: { query: string; mediaType: 'MOVIE' | 'TV' | undefined; region?: string }): Promise<{ items: CanonicalMediaItem[]; cachedUntil: string }> {
  const searchInput = input.mediaType ? { query: input.query, mediaType: input.mediaType, region: input.region ?? 'CA', language: 'en-CA' as const, limit: 12 } : { query: input.query, region: input.region ?? 'CA', language: 'en-CA' as const, limit: 12 };
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
