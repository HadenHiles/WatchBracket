import { describe, expect, it } from 'vitest';
import { TmdbProvider } from './tmdb.js';

const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });

describe('TmdbProvider', () => {
  it('normalizes canonical identity, artwork, ratings, and distinct Canadian availability categories', async () => {
    const fakeFetch = (async (input: URL | RequestInfo) => {
      const url = new URL(input instanceof URL ? input : String(input));
      expect(url.searchParams.get('api_key')).toBe('valid-read-token');
      if (url.pathname === '/3/search/multi') return json({ results: [{ id: 11, media_type: 'movie', title: 'Example', release_date: '2024-03-01' }] });
      if (url.pathname === '/3/movie/11') return json({
        id: 11, title: 'Example', original_title: 'Example Original', release_date: '2024-03-01', overview: 'A complete example.', runtime: 112,
        genres: [{ id: 878, name: 'Science Fiction' }], poster_path: '/poster.jpg', backdrop_path: '/backdrop.jpg', popularity: 25, vote_average: 7.5, vote_count: 1200, adult: false,
        release_dates: { results: [{ iso_3166_1: 'CA', release_dates: [{ certification: 'PG-13', type: 3 }] }] },
        'watch/providers': { results: { CA: { link: 'https://www.themoviedb.org/movie/11/watch', flatrate: [{ provider_id: 8, provider_name: 'StreamCo', logo_path: '/stream.png' }], ads: [{ provider_id: 9, provider_name: 'AdFlix', logo_path: null }], rent: [{ provider_id: 10, provider_name: 'Rental', logo_path: '/rent.png' }], buy: [{ provider_id: 10, provider_name: 'Rental', logo_path: '/rent.png' }] } } }
      });
      throw new Error(`Unexpected TMDB path ${url.pathname}`);
    }) as typeof fetch;
    const provider = new TmdbProvider('valid-read-token', fakeFetch);
    const [item] = await provider.search({ query: 'Example', mediaType: undefined, region: 'CA', language: 'en-CA', limit: 12 });
    expect(item).toMatchObject({ catalogKey: 'tmdb:MOVIE:11', tmdbId: 11, title: 'Example', releaseYear: 2024, runtimeMinutes: 112, contentRating: 'PG-13' });
    expect(item?.posterUrl).toBe('https://image.tmdb.org/t/p/w500/poster.jpg');
    expect(item?.availability.attribution).toBe('JustWatch');
    expect(item?.availability.offers.map((offer) => offer.category)).toEqual(['SUBSCRIPTION', 'ADS', 'RENT', 'BUY']);
  });
});
