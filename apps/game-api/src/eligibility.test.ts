import { describe, expect, it } from 'vitest';
import type { HouseRules } from '@watch-bracket/realtime-protocol';
import { eligibilityFailures } from './eligibility.js';

const rules: HouseRules = { preset: 'MOVIE_NIGHT', nominationDurationSeconds: 120, nominationSlots: 2, revealMode: 'AFTER_DEADLINE', mediaTypes: ['MOVIE'], maxRuntimeMinutes: 120, releaseYearMin: 2000, releaseYearMax: 2030, excludedGenres: ['Horror'], availabilityMode: 'WATCH_NOW', enabledStreamingProviderIds: [8] };
const item = { mediaType: 'MOVIE' as const, releaseYear: 2024, runtimeMinutes: 110, genres: ['Science Fiction'], adult: false, availability: { region: 'CA', link: null, attribution: 'JustWatch' as const, offers: [{ providerId: 8, providerName: 'StreamCo', logoUrl: null, category: 'SUBSCRIPTION' as const }] } };

describe('hard candidate eligibility', () => {
  it('admits an item only when every configured hard filter passes', () => expect(eligibilityFailures(item, rules)).toEqual([]));
  it('reports all violations so no fallback can silently bypass them', () => expect(eligibilityFailures({ ...item, mediaType: 'TV', releaseYear: 1999, runtimeMinutes: 160, genres: ['Horror'], availability: { ...item.availability, offers: [] } }, rules)).toEqual(['MEDIA_TYPE','MAX_RUNTIME','RELEASE_YEAR_MIN','EXCLUDED_GENRE','WATCH_NOW_UNAVAILABLE']));
});
