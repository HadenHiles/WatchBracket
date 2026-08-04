import { describe, expect, it } from 'vitest';
import { mockCatalog, searchMockCatalog, searchSeededCatalogSnapshot, seededCatalogSnapshot } from './index.js';

describe('deterministic mock catalog', () => {
  it('has stable unique keys and supports deterministic multi-term search', () => {
    expect(new Set(mockCatalog.map((item) => item.catalogKey)).size).toBe(mockCatalog.length);
    expect(searchMockCatalog('science fiction').map((item) => item.catalogKey)).toEqual(['mock:aurora-drift', 'mock:dinner-at-orbit-nine', 'mock:half-past-mars', 'mock:kestrel-station']);
  });

  it('filters movies and television without fabricating results', () => {
    expect(searchMockCatalog('drama', 'TV').every((item) => item.mediaType === 'TV')).toBe(true);
    expect(searchMockCatalog('definitely absent')).toEqual([]);
  });

  it('keeps real-title browser automation deterministic and provider-free', () => {
    expect(searchSeededCatalogSnapshot('Dune')).toHaveLength(2);
    expect(searchSeededCatalogSnapshot('Star Wars')).toHaveLength(2);
    expect(searchSeededCatalogSnapshot('The Matrix')[0]?.title).toBe('The Matrix');
    expect(searchSeededCatalogSnapshot('Alien')).toHaveLength(2);
    expect(seededCatalogSnapshot.every((item) => item.catalogKey.startsWith('mock:tmdb-snapshot:') && item.posterUrl?.startsWith('/artwork/seeded/'))).toBe(true);
  });
});
