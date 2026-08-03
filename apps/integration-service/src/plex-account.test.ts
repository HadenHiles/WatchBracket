import { describe, expect, it } from 'vitest';
import { decryptPlexToken, encryptPlexToken, parsePlexWatchlist } from './plex-account.js';

describe('participant Plex accounts', () => {
  it('encrypts personal tokens at rest and authenticates the ciphertext', () => {
    const encrypted = encryptPlexToken('personal-secret-token', 'shared-secret-with-enough-entropy');
    expect(encrypted).not.toContain('personal-secret-token');
    expect(decryptPlexToken(encrypted, 'shared-secret-with-enough-entropy')).toBe('personal-secret-token');
    expect(() => decryptPlexToken(`${encrypted.slice(0, -1)}x`, 'shared-secret-with-enough-entropy')).toThrow();
  });

  it('maps only movie and show watchlist entries with TMDB identities', () => {
    expect(parsePlexWatchlist({ MediaContainer: { Metadata: [
      { type: 'movie', title: 'The Matrix', year: 1999, Guid: [{ id: 'tmdb://603' }] },
      { type: 'show', title: 'Severance', year: 2022, Guid: [{ id: 'themoviedb://95396' }] },
      { type: 'episode', title: 'Not a quick pick', Guid: [{ id: 'tmdb://1' }] },
      { type: 'movie', title: 'No external match', Guid: [{ id: 'imdb://tt123' }] }
    ] } })).toEqual([
      { tmdbId: 603, mediaType: 'MOVIE', title: 'The Matrix', year: 1999 },
      { tmdbId: 95396, mediaType: 'TV', title: 'Severance', year: 2022 }
    ]);
  });
});
