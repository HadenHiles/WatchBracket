import { z } from 'zod';
import { CanonicalMediaItemSchema, type CanonicalMediaItem, type RecommendationCandidate } from '@watch-bracket/provider-contracts';

const API_ORIGIN = 'https://api.themoviedb.org';
const IMAGE_ORIGIN = 'https://image.tmdb.org/t/p';
const METADATA_TTL_MS = 6 * 60 * 60 * 1000;

const SearchItemSchema = z.object({
  id: z.number().int().positive(), media_type: z.enum(['movie', 'tv']).optional(),
  title: z.string().optional(), name: z.string().optional(), original_title: z.string().optional(), original_name: z.string().optional(),
  release_date: z.string().optional(), first_air_date: z.string().optional(), overview: z.string().optional(),
  poster_path: z.string().nullable().optional(), backdrop_path: z.string().nullable().optional(), adult: z.boolean().optional(),
  popularity: z.number().optional(), vote_average: z.number().optional(), vote_count: z.number().int().optional()
});
const ResultsSchema = z.object({ results: z.array(SearchItemSchema) });
const ProviderSchema = z.object({ provider_id: z.number().int().positive(), provider_name: z.string(), logo_path: z.string().nullable().optional() });
const RegionProvidersSchema = z.object({ link: z.string().url().nullable().optional(), flatrate: z.array(ProviderSchema).optional(), free: z.array(ProviderSchema).optional(), ads: z.array(ProviderSchema).optional(), rent: z.array(ProviderSchema).optional(), buy: z.array(ProviderSchema).optional() });
const DetailsSchema = SearchItemSchema.extend({
  runtime: z.number().int().positive().nullable().optional(), episode_run_time: z.array(z.number().int().positive()).optional(),
  genres: z.array(z.object({ id: z.number().int(), name: z.string() })).default([]),
  release_dates: z.object({ results: z.array(z.object({ iso_3166_1: z.string(), release_dates: z.array(z.object({ certification: z.string().optional(), type: z.number().int().optional() })) })) }).optional(),
  content_ratings: z.object({ results: z.array(z.object({ iso_3166_1: z.string(), rating: z.string().optional() })) }).optional(),
  'watch/providers': z.object({ results: z.record(z.string(), RegionProvidersSchema) }).optional()
});

type MediaType = 'MOVIE' | 'TV';
type SearchItem = z.infer<typeof SearchItemSchema>;
type Details = z.infer<typeof DetailsSchema>;
type Fetcher = typeof fetch;
type CacheEntry = { expiresAt: number; value: unknown };

export class TmdbProviderError extends Error {
  constructor(public readonly code: 'NOT_CONFIGURED' | 'UPSTREAM_ERROR' | 'UPSTREAM_TIMEOUT' | 'INVALID_RESPONSE', message: string) { super(message); }
}

export class TmdbProvider {
  private readonly cache = new Map<string, CacheEntry>();
  constructor(private readonly token: string | undefined, private readonly fetcher: Fetcher = fetch) {}

  get configured() { return Boolean(this.token && !this.token.toLowerCase().includes('replace-me')); }

  private async request(path: string, query: Record<string, string | number | boolean | undefined> = {}) {
    if (!this.configured) throw new TmdbProviderError('NOT_CONFIGURED', 'TMDB is not configured.');
    const url = new URL(`/3${path}`, API_ORIGIN);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    const bearerToken = this.token!.startsWith('eyJ') ? this.token : undefined;
    if (!bearerToken) url.searchParams.set('api_key', this.token!);
    const cacheKey = url.toString(); const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await this.fetcher(url, { headers: { ...(bearerToken ? { authorization: `Bearer ${bearerToken}` } : {}), accept: 'application/json' }, signal: AbortSignal.timeout(5_000) });
        if (response.ok) { const value: unknown = await response.json(); this.cache.set(cacheKey, { value, expiresAt: Date.now() + METADATA_TTL_MS }); return value; }
        if (response.status !== 429 && response.status < 500) throw new TmdbProviderError('UPSTREAM_ERROR', `TMDB rejected the request (${response.status}).`);
        if (attempt === 2) throw new TmdbProviderError('UPSTREAM_ERROR', `TMDB is temporarily unavailable (${response.status}).`);
      } catch (error) {
        if (error instanceof TmdbProviderError) throw error;
        if (attempt === 2) throw new TmdbProviderError(error instanceof DOMException && error.name === 'TimeoutError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_ERROR', 'TMDB did not respond in time.');
      }
    }
    throw new TmdbProviderError('UPSTREAM_ERROR', 'TMDB is temporarily unavailable.');
  }

  private async details(mediaType: MediaType, id: number, region: string, language: string): Promise<CanonicalMediaItem> {
    const pathType = mediaType === 'MOVIE' ? 'movie' : 'tv';
    const raw = await this.request(`/${pathType}/${id}`, { language, append_to_response: mediaType === 'MOVIE' ? 'release_dates,watch/providers' : 'content_ratings,watch/providers' });
    const parsed = DetailsSchema.safeParse(raw);
    if (!parsed.success) throw new TmdbProviderError('INVALID_RESPONSE', `TMDB returned invalid ${pathType} details.`);
    return this.normalize(parsed.data, mediaType, region);
  }

  private normalize(item: Details, mediaType: MediaType, region: string): CanonicalMediaItem {
    const title = mediaType === 'MOVIE' ? item.title : item.name;
    const originalTitle = mediaType === 'MOVIE' ? item.original_title : item.original_name;
    const releaseDate = mediaType === 'MOVIE' ? item.release_date : item.first_air_date;
    if (!title || !originalTitle || !releaseDate || !/^\d{4}/.test(releaseDate)) throw new TmdbProviderError('INVALID_RESPONSE', 'TMDB metadata is missing a title or release date.');
    const regionCode = region.toUpperCase();
    const providers = item['watch/providers']?.results[regionCode];
    const categoryMap = { flatrate: 'SUBSCRIPTION', free: 'FREE', ads: 'ADS', rent: 'RENT', buy: 'BUY' } as const;
    const offers = Object.entries(categoryMap).flatMap(([key, category]) => (providers?.[key as keyof typeof categoryMap] ?? []).map((provider) => ({ providerId: provider.provider_id, providerName: provider.provider_name, logoUrl: provider.logo_path ? `${IMAGE_ORIGIN}/w92${provider.logo_path}` : null, category })));
    const certification = mediaType === 'MOVIE'
      ? item.release_dates?.results.find((entry) => entry.iso_3166_1 === regionCode)?.release_dates.filter((entry) => entry.certification).sort((a, b) => (b.type ?? 0) - (a.type ?? 0))[0]?.certification
      : item.content_ratings?.results.find((entry) => entry.iso_3166_1 === regionCode)?.rating;
    const runtime = mediaType === 'MOVIE' ? item.runtime ?? null : item.episode_run_time?.find((value) => value > 0) ?? null;
    return CanonicalMediaItemSchema.parse({
      catalogKey: `tmdb:${mediaType}:${item.id}`, tmdbId: item.id, mediaType, title, originalTitle,
      releaseDate, releaseYear: Number(releaseDate.slice(0, 4)), runtimeMinutes: runtime, contentRating: certification || null,
      genres: item.genres.map((genre) => genre.name), synopsis: item.overview ?? '',
      posterUrl: item.poster_path ? `${IMAGE_ORIGIN}/w500${item.poster_path}` : null,
      backdropUrl: item.backdrop_path ? `${IMAGE_ORIGIN}/w1280${item.backdrop_path}` : null,
      popularity: Math.max(0, item.popularity ?? 0), voteAverage: Math.max(0, Math.min(10, item.vote_average ?? 0)), voteCount: Math.max(0, item.vote_count ?? 0), adult: item.adult ?? false,
      availability: { region: regionCode, link: providers?.link ?? null, attribution: 'JustWatch', offers }
    });
  }

  private async mapDetails(items: Array<{ item: SearchItem; mediaType: MediaType }>, region: string, language: string, limit: number) {
    const output: CanonicalMediaItem[] = [];
    for (let offset = 0; offset < items.length && output.length < limit; offset += 4) {
      const batch = items.slice(offset, offset + 4);
      const settled = await Promise.allSettled(batch.map(({ item, mediaType }) => this.details(mediaType, item.id, region, language)));
      for (const result of settled) if (result.status === 'fulfilled' && !result.value.adult) output.push(result.value);
    }
    return output.slice(0, limit);
  }

  async search(input: { query: string; mediaType: MediaType | undefined; region: string; language: string; limit: number }) {
    const raw = await this.request('/search/multi', { query: input.query, include_adult: false, language: input.language, page: 1 });
    const parsed = ResultsSchema.safeParse(raw);
    if (!parsed.success) throw new TmdbProviderError('INVALID_RESPONSE', 'TMDB returned invalid search results.');
    const candidates = parsed.data.results.flatMap((item) => {
      const mediaType: MediaType | undefined = item.media_type === 'movie' ? 'MOVIE' : item.media_type === 'tv' ? 'TV' : undefined;
      return mediaType && (!input.mediaType || input.mediaType === mediaType) ? [{ item, mediaType }] : [];
    });
    return this.mapDetails(candidates, input.region, input.language, input.limit);
  }

  async recommendations(input: { seeds: Array<{ tmdbId: number; mediaType: MediaType }>; region: string; language: string; limit: number }): Promise<RecommendationCandidate[]> {
    const merged = new Map<string, { item: SearchItem; mediaType: MediaType; seedKeys: Set<string>; sourceKinds: Set<'RECOMMENDATIONS' | 'SIMILAR' | 'DISCOVER'> }>();
    for (const seed of input.seeds) {
      const pathType = seed.mediaType === 'MOVIE' ? 'movie' : 'tv'; const seedKey = `tmdb:${seed.mediaType}:${seed.tmdbId}`;
      const seedDetails = DetailsSchema.safeParse(await this.request(`/${pathType}/${seed.tmdbId}`, { language: input.language }));
      const primaryGenreId = seedDetails.success ? seedDetails.data.genres[0]?.id : undefined;
      const sources = await Promise.all([
        this.request(`/${pathType}/${seed.tmdbId}/recommendations`, { language: input.language, page: 1 }).then((value) => ({ kind: 'RECOMMENDATIONS' as const, value })),
        this.request(`/${pathType}/${seed.tmdbId}/similar`, { language: input.language, page: 1 }).then((value) => ({ kind: 'SIMILAR' as const, value })),
        primaryGenreId ? this.request(`/discover/${pathType}`, { language: input.language, page: 1, include_adult: false, sort_by: 'popularity.desc', with_genres: primaryGenreId, watch_region: input.region }).then((value) => ({ kind: 'DISCOVER' as const, value })) : Promise.resolve({ kind: 'DISCOVER' as const, value: { results: [] } })
      ]);
      for (const source of sources) {
        const parsed = ResultsSchema.safeParse(source.value); if (!parsed.success) continue;
        for (const item of parsed.data.results) {
          const key = `tmdb:${seed.mediaType}:${item.id}`; if (key === seedKey) continue;
          const current = merged.get(key) ?? { item, mediaType: seed.mediaType, seedKeys: new Set<string>(), sourceKinds: new Set<'RECOMMENDATIONS' | 'SIMILAR' | 'DISCOVER'>() };
          current.seedKeys.add(seedKey); current.sourceKinds.add(source.kind); merged.set(key, current);
        }
      }
    }
    const ranked = [...merged.values()].sort((a, b) => b.seedKeys.size - a.seedKeys.size || (b.item.vote_count ?? 0) - (a.item.vote_count ?? 0) || a.item.id - b.item.id).slice(0, Math.max(input.limit * 2, input.limit));
    const details = await this.mapDetails(ranked.map(({ item, mediaType }) => ({ item, mediaType })), input.region, input.language, input.limit);
    return details.map((item) => { const source = merged.get(item.catalogKey)!; return { item, relatedSeedKeys: [...source.seedKeys].sort(), sourceKinds: [...source.sourceKinds].sort() }; });
  }
}

export const tmdbMetadataTtlMs = METADATA_TTL_MS;
