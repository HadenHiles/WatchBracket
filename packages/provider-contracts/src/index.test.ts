import { describe, expect, it } from 'vitest';
import { ProviderOperationSchema } from './index.js';

describe('provider operation boundary', () => {
  it('rejects direct Seerr mutations', () => {
    expect(ProviderOperationSchema.safeParse({
      provider: 'SEERR',
      operation: 'SEERR_REQUEST',
      input: { tmdbId: 438631, mediaType: 'MOVIE' },
    }).success).toBe(false);
  });
});
