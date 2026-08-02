import { describe, expect, it } from 'vitest';
import { mockCatalog, searchMockCatalog } from './index.js';

describe('deterministic mock catalog', () => {
  it('has stable unique keys and supports deterministic multi-term search', () => {
    expect(new Set(mockCatalog.map((item) => item.catalogKey)).size).toBe(mockCatalog.length);
    expect(searchMockCatalog('science fiction').map((item) => item.catalogKey)).toEqual(['mock:aurora-drift', 'mock:dinner-at-orbit-nine', 'mock:half-past-mars', 'mock:kestrel-station']);
  });

  it('filters movies and television without fabricating results', () => {
    expect(searchMockCatalog('drama', 'TV').every((item) => item.mediaType === 'TV')).toBe(true);
    expect(searchMockCatalog('definitely absent')).toEqual([]);
  });
});
