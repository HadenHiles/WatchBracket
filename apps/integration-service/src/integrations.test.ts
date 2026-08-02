import { describe, expect, it, vi } from 'vitest';
import { PlexProvider, SeerrProvider, TautulliProvider } from './integrations.js';

const json = (value: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } }));

describe('private media integrations', () => {
  it('maps Plex GUID inventory without exposing its token', async () => {
    const fetcher = vi.fn((url: URL | RequestInfo) => {
      const path = new URL(String(url)).pathname;
      if (path === '/identity') return json({ MediaContainer: { machineIdentifier: 'server-1' } });
      if (path === '/library/sections') return json({ MediaContainer: { Directory: [{ key: '1', title: 'Movies', type: 'movie' }] } });
      return json({ MediaContainer: { Metadata: [{ ratingKey: '99', title: 'Dune', year: 2021, Guid: [{ id: 'tmdb://438631' }] }] } });
    });
    const result = await new PlexProvider('http://plex.local:32400', 'super-secret-token', fetcher as typeof fetch).inventory();
    expect(result.items[0]).toMatchObject({ tmdbId: 438631, ratingKey: '99', libraryTitle: 'Movies' });
    expect(JSON.stringify(result)).not.toContain('super-secret-token');
  });

  it('reduces Tautulli history to household-level title counts', async () => {
    const fetcher = vi.fn(() => json({ response: { result: 'success', data: { data: [
      { title: 'Dune', media_type: 'movie', guid: 'tmdb://438631', date: 1_700_000_000, user: 'private-user' },
      { title: 'Dune', media_type: 'movie', guid: 'tmdb://438631', date: 1_700_000_100, user: 'someone-else' }
    ] } } }));
    const result = await new TautulliProvider('http://tautulli.local', 'secret-key', fetcher as typeof fetch).history(100);
    expect(result.items[0]).toMatchObject({ tmdbId: 438631, title: 'Dune', playCount: 2 });
    expect(JSON.stringify(result)).not.toContain('private-user');
  });

  it('builds only server-controlled Seerr request fields', async () => {
    const fetcher = vi.fn((_url: URL | RequestInfo, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({ mediaType: 'tv', mediaId: 1399, seasons: [1] });
      return json({ id: 42, media: { status: 2 } });
    });
    const result = await new SeerrProvider('http://seerr.local', 'secret-key', fetcher as typeof fetch).request({ tmdbId: 1399, mediaType: 'TV', tvSeasonPolicy: 'FIRST' });
    expect(result).toEqual({ requestId: 42, status: 'PENDING' });
  });
});
