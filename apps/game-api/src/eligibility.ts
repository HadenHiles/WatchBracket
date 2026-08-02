import { MediaAvailabilitySchema } from '@watch-bracket/provider-contracts';
import type { HouseRules } from '@watch-bracket/realtime-protocol';

type EligibleMedia = { mediaType: 'MOVIE' | 'TV'; releaseYear: number; runtimeMinutes: number | null; genres: unknown; metadata?: unknown; adult?: boolean; availability?: unknown; localAvailability?: { available?: boolean } | undefined; requestAvailability?: { requestable?: boolean } | undefined };

export function eligibilityFailures(item: EligibleMedia, rules: HouseRules): string[] {
  const failures: string[] = [];
  if (item.adult || (item.metadata && typeof item.metadata === 'object' && (item.metadata as Record<string, unknown>).adult === true)) failures.push('ADULT_CONTENT');
  if (rules.mediaTypes?.length && !rules.mediaTypes.includes(item.mediaType)) failures.push('MEDIA_TYPE');
  if (!item.runtimeMinutes) failures.push('MISSING_RUNTIME');
  if (rules.maxRuntimeMinutes && item.runtimeMinutes && item.runtimeMinutes > rules.maxRuntimeMinutes) failures.push('MAX_RUNTIME');
  if (rules.releaseYearMin && item.releaseYear < rules.releaseYearMin) failures.push('RELEASE_YEAR_MIN');
  if (rules.releaseYearMax && item.releaseYear > rules.releaseYearMax) failures.push('RELEASE_YEAR_MAX');
  const genres = Array.isArray(item.genres) ? item.genres.filter((genre): genre is string => typeof genre === 'string') : [];
  if (rules.excludedGenres?.some((excluded) => genres.some((genre) => genre.toLocaleLowerCase() === excluded.toLocaleLowerCase()))) failures.push('EXCLUDED_GENRE');
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {};
  const availability = MediaAvailabilitySchema.safeParse(item.availability ?? metadata.availability);
  if (rules.availabilityMode === 'WATCH_NOW' || rules.availabilityMode === 'HYBRID') {
    const offers = availability.success ? availability.data.offers.filter((offer) => ['SUBSCRIPTION', 'FREE', 'ADS'].includes(offer.category)) : [];
    const enabled = rules.enabledStreamingProviderIds ?? [];
    const local = item.localAvailability?.available === true || objectBoolean(metadata.localAvailability, 'available');
    const requestable = item.requestAvailability?.requestable === true || objectBoolean(metadata.requestAvailability, 'requestable');
    const streamable = offers.some((offer) => !enabled.length || enabled.includes(offer.providerId));
    if (rules.availabilityMode === 'WATCH_NOW' && !streamable && !local) failures.push('WATCH_NOW_UNAVAILABLE');
    if (rules.availabilityMode === 'HYBRID' && !streamable && !local && !requestable) failures.push('HYBRID_UNAVAILABLE');
  }
  return failures;
}

function objectBoolean(value: unknown, key: string) { return Boolean(value && typeof value === 'object' && (value as Record<string, unknown>)[key] === true); }
