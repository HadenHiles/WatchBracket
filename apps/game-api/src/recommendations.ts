import { createHash } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  candidates,
  households,
  mediaItems,
  participants,
  rooms,
  submissions,
  type Database,
} from "@watch-bracket/db";
import type { RecommendationCandidate } from "@watch-bracket/provider-contracts";
import { HouseRulesSchema } from "@watch-bracket/realtime-protocol";
import type { DomainContext } from "./domain.js";
import { eligibilityFailures } from "./eligibility.js";
import { cacheTmdbItems } from "./nominations.js";
import {
  enrichWithHouseholdProviders,
  getGroupPlexPreferences,
  getTautulliHistory,
  recommendFromTmdb,
} from "./providers.js";
import { getRecentMediaExclusions } from "./history.js";

export type PreparedWildcard = {
  mediaItemId: string;
  catalogKey: string;
  scoreTotal: number;
  scoreComponents: Record<string, number>;
  reasonCodes: string[];
};

export function prioritizeUnseenCandidates<T extends { mediaItemId: string }>(
  items: T[],
  recentExclusions: Set<string>,
) {
  const unseen: T[] = [];
  const recent: T[] = [];
  for (const item of items)
    (recentExclusions.has(item.mediaItemId) ? recent : unseen).push(item);
  return [...unseen, ...recent];
}

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const stableTie = (seed: string, key: string) =>
  parseInt(
    createHash("sha256").update(`${seed}:${key}`).digest("hex").slice(0, 6),
    16,
  ) / 0xffffff;

export const isEnglishRecommendation = (candidate: RecommendationCandidate) =>
  candidate.item.originalLanguage.toLowerCase() === "en";

export function scoreCandidate(
  candidate: RecommendationCandidate,
  tasteGenres: Map<string, number>,
  roomSeed: string,
  referenceYear: number,
  preferenceOwners: Map<string, Set<string>>,
  householdHistorySeedKeys: Set<string>,
  tasteParticipantCount: number,
) {
  const item = candidate.item;
  const watchNow =
    item.localAvailability?.available === true ||
    item.availability.offers.some((offer) =>
      ["SUBSCRIPTION", "FREE", "ADS"].includes(offer.category),
    );
  const paid = item.availability.offers.some(
    (offer) => offer.category === "RENT" || offer.category === "BUY",
  );
  const similarity = clamp(
    candidate.sourceKinds.includes("RECOMMENDATIONS") ? 0.9 : 0.72,
  );
  const availableNow = watchNow ? 1 : paid ? 0.6 : 0.15;
  const clusterSupport = clamp(candidate.relatedSeedKeys.length / 2);
  const ratingConfidence = clamp(
    (item.voteAverage / 10) * (Math.log10(item.voteCount + 1) / 4),
  );
  const primaryGenre = item.genres[0] ?? "Unknown";
  const strongestGenreSignal = Math.max(0, ...tasteGenres.values());
  const genreSignals = item.genres
    .map((genre) => tasteGenres.get(genre.toLocaleLowerCase()) ?? 0)
    .sort((left, right) => right - left)
    .slice(0, 2);
  const tasteGenreFit = strongestGenreSignal
    ? clamp(
        genreSignals.reduce((total, signal) => total + signal, 0) /
          (Math.max(1, genreSignals.length) * strongestGenreSignal),
      )
    : 0;
  const runtimeFit = item.runtimeMinutes
    ? clamp(1 - Math.abs(item.runtimeMinutes - 110) / 120)
    : 0;
  const age = referenceYear - item.releaseYear;
  const eraFit = age <= 5 ? 0.9 : age <= 20 ? 1 : 0.75;
  const householdFit = clamp(
    1 - Math.log10((item.householdHistoryScore ?? 0) + 1) / 3,
  );
  const requestable = item.requestAvailability?.requestable ? 1 : 0;
  const matchingPeople = new Set(
    candidate.relatedSeedKeys.flatMap((key) => [
      ...(preferenceOwners.get(key) ?? []),
    ]),
  );
  const groupPreferenceFit = clamp(
    matchingPeople.size / Math.max(1, tasteParticipantCount),
  );
  const householdHistoryFit = candidate.relatedSeedKeys.some((key) =>
    householdHistorySeedKeys.has(key),
  ) ? 1 : 0;
  const audienceReach = clamp(Math.log10(item.voteCount + 1) / 4.5);
  const popularityReach = clamp(Math.log10(item.popularity + 1) / 2.3);
  const mainstreamConfidence = popularityReach * 0.55 + audienceReach * 0.45;
  const tasteStrength = Math.max(
    tasteGenreFit,
    groupPreferenceFit,
    householdHistoryFit,
  );
  const mainstreamSafety = mainstreamConfidence * (1 - tasteStrength * 0.5);
  const scoreComponents = {
    similarity,
    availableNow,
    clusterSupport,
    ratingConfidence,
    tasteGenreFit,
    runtimeFit,
    eraFit,
    mainstreamConfidence,
    mainstreamSafety,
    householdFit,
    requestable,
    groupPreferenceFit,
    householdHistoryFit,
  };
  const weighted =
    similarity * 0.11 +
    availableNow * 0.13 +
    clusterSupport * 0.08 +
    ratingConfidence * 0.09 +
    tasteGenreFit * 0.22 +
    runtimeFit * 0.04 +
    eraFit * 0.03 +
    mainstreamSafety * 0.14 +
    householdFit * 0.03 +
    requestable * 0.01 +
    groupPreferenceFit * 0.1 +
    householdHistoryFit * 0.02;
  const matchingGenres = item.genres.filter(
    (genre) => (tasteGenres.get(genre.toLocaleLowerCase()) ?? 0) > 0,
  );
  const reasons = [
    candidate.relatedSeedKeys.length > 1
      ? `Similar to ${candidate.relatedSeedKeys.length} group picks`
      : "Similar to a group pick",
    item.localAvailability?.available
      ? `Available in Plex${item.localAvailability.libraryTitle ? ` · ${item.localAvailability.libraryTitle}` : ""}`
      : watchNow
        ? `Available to stream in ${item.availability.region}`
        : item.requestAvailability?.requestable
          ? "Available to request from Seerr"
          : paid
            ? `Available to rent or buy in ${item.availability.region}`
            : `Metadata verified for ${item.availability.region}`,
    item.runtimeMinutes
      ? `Fits a typical movie-night runtime at ${item.runtimeMinutes} minutes`
      : undefined,
    tasteGenreFit >= 0.5 && matchingGenres.length
      ? `Matches the group's ${matchingGenres.slice(0, 2).join(" and ").toLowerCase()} taste`
      : undefined,
    candidate.sourceKinds.includes("RECOMMENDATIONS")
      ? "Recommended by TMDB"
      : "Similar title from TMDB",
    matchingPeople.size > 1
      ? `Matches ${matchingPeople.size} players' Plex tastes`
      : matchingPeople.size === 1
        ? "Matches a player's Plex tastes"
        : undefined,
    householdHistoryFit ? "Fits household viewing history" : undefined,
    tasteStrength < 0.35 && mainstreamConfidence >= 0.65
      ? "Popular, well-established fallback"
      : undefined,
  ].filter((reason): reason is string => Boolean(reason));
  return {
    scoreComponents,
    reasonCodes: reasons,
    scoreTotal:
      5000 +
      Math.round(weighted * 4000) +
      Math.round(stableTie(roomSeed, item.catalogKey) * 99),
    primaryGenre,
  };
}

export function interleavePlexPreferences(
  people: Array<{
    participantId: string;
    items: Array<{ tmdbId: number; mediaType: "MOVIE" | "TV" }>;
  }>,
) {
  const interleaved: Array<{ tmdbId: number; mediaType: "MOVIE" | "TV" }> = [];
  const longestList = Math.max(0, ...people.map((person) => person.items.length));
  for (let index = 0; index < longestList; index += 1)
    for (const person of people) {
      const item = person.items[index];
      if (item) interleaved.push(item);
    }
  return interleaved;
}

export async function prepareTmdbWildcards(
  ctx: DomainContext,
  roomId: string,
  limit: number,
): Promise<PreparedWildcard[]> {
  const [room] = await ctx.db
    .select({
      randomSeed: rooms.randomSeed,
      householdId: rooms.householdId,
      rules: rooms.rules,
      createdAt: rooms.createdAt,
    })
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room) return [];
  const [household] = await ctx.db
    .select({
      region: households.region,
      historyEnabled: households.historyEnabled,
      recentExclusionDays: households.recentExclusionDays,
    })
    .from(households)
    .where(eq(households.id, room.householdId))
    .limit(1);
  const direct = await ctx.db
    .select({
      catalogKey: mediaItems.catalogKey,
      tmdbId: mediaItems.tmdbId,
      mediaType: mediaItems.mediaType,
      genres: mediaItems.genres,
      participantId: submissions.participantId,
    })
    .from(submissions)
    .innerJoin(mediaItems, eq(submissions.mediaItemId, mediaItems.id))
    .where(eq(submissions.roomId, roomId));
  const people = await ctx.db
    .select({ id: participants.id })
    .from(participants)
    .where(and(eq(participants.roomId, roomId), isNull(participants.removedAt)));
  const [plexPreferences, tautulliHistory] = await Promise.all([
    getGroupPlexPreferences(ctx, people.map((person) => person.id)).catch(() => ({ participants: [] })),
    getTautulliHistory(ctx, 500).catch(() => ({ items: [] })),
  ]);
  const preferenceOwners = new Map<string, Set<string>>();
  const addPreferenceOwner = (key: string, participantId: string) => {
    const owners = preferenceOwners.get(key) ?? new Set<string>();
    owners.add(participantId);
    preferenceOwners.set(key, owners);
  };
  for (const item of direct)
    if (item.tmdbId)
      addPreferenceOwner(item.catalogKey, item.participantId);
  for (const person of plexPreferences.participants)
    for (const item of person.items)
      addPreferenceOwner(`tmdb:${item.mediaType}:${item.tmdbId}`, person.participantId);
  const householdHistorySeedKeys = new Set(
    tautulliHistory.items.flatMap((item) =>
      item.tmdbId && item.mediaType ? [`tmdb:${item.mediaType}:${item.tmdbId}`] : [],
    ),
  );
  const seedEntries = new Map<string, { tmdbId: number; mediaType: "MOVIE" | "TV" }>();
  for (const item of direct)
    if (item.tmdbId)
      seedEntries.set(item.catalogKey, { tmdbId: item.tmdbId, mediaType: item.mediaType });
  for (const item of interleavePlexPreferences(plexPreferences.participants)) {
    const key = `tmdb:${item.mediaType}:${item.tmdbId}`;
    if (!seedEntries.has(key)) seedEntries.set(key, item);
  }
  for (const item of tautulliHistory.items)
    if (item.tmdbId && item.mediaType) {
      const key = `tmdb:${item.mediaType}:${item.tmdbId}`;
      if (!seedEntries.has(key)) seedEntries.set(key, { tmdbId: item.tmdbId, mediaType: item.mediaType });
    }
  const seeds = [...seedEntries.values()].slice(0, 16);
  if (!seeds.length) return [];
  const result = await recommendFromTmdb(ctx, {
    seeds,
    region: household?.region ?? "CA",
    limit: Math.min(48, Math.max(limit * 3, 16)),
  });
  const directKeys = new Set(direct.map((item) => item.catalogKey));
  const rules = HouseRulesSchema.parse(room.rules);
  const enrichedItems = await enrichWithHouseholdProviders(
    ctx,
    result.candidates.map((candidate) => candidate.item),
  );
  const enrichedByKey = new Map(
    enrichedItems.map((item) => [item.catalogKey, item]),
  );
  const canonical = [
    ...new Map(
      result.candidates
        .map((candidate) => ({
          ...candidate,
          item: enrichedByKey.get(candidate.item.catalogKey) ?? candidate.item,
        }))
        .filter(
          (candidate) =>
            isEnglishRecommendation(candidate) &&
            !directKeys.has(candidate.item.catalogKey) &&
            eligibilityFailures(candidate.item, rules).length === 0,
        )
        .map((candidate) => [candidate.item.catalogKey, candidate]),
    ).values(),
  ];
  await cacheTmdbItems(
    ctx,
    canonical.map((candidate) => candidate.item),
    result.cachedUntil,
    roomId,
  );
  if (!canonical.length) return [];
  const rows = await ctx.db
    .select({ id: mediaItems.id, catalogKey: mediaItems.catalogKey })
    .from(mediaItems)
    .where(
      inArray(
        mediaItems.catalogKey,
        canonical.map((candidate) => candidate.item.catalogKey),
      ),
    );
  const idByKey = new Map(rows.map((row) => [row.catalogKey, row.id]));
  const recentExclusions = household?.historyEnabled
    ? await getRecentMediaExclusions(
        ctx.db,
        room.householdId,
        household.recentExclusionDays,
      )
    : new Set<string>();
  const tasteGenres = new Map<string, number>();
  for (const item of direct) {
    const genres = Array.isArray(item.genres)
      ? item.genres.filter((genre): genre is string => typeof genre === "string")
      : [];
    for (const genre of genres) {
      const key = genre.toLocaleLowerCase();
      tasteGenres.set(key, (tasteGenres.get(key) ?? 0) + 1);
    }
  }
  const tasteParticipantCount = new Set(
    [...preferenceOwners.values()].flatMap((owners) => [...owners]),
  ).size;
  const ranked = canonical
    .flatMap((candidate) => {
      const mediaItemId = idByKey.get(candidate.item.catalogKey);
      if (!mediaItemId) return [];
      return [
        {
          mediaItemId,
          catalogKey: candidate.item.catalogKey,
          ...scoreCandidate(
            candidate,
            tasteGenres,
            room.randomSeed,
            room.createdAt.getUTCFullYear(),
            preferenceOwners,
            householdHistorySeedKeys,
            tasteParticipantCount,
          ),
        },
      ];
    })
    .sort(
      (a, b) =>
        b.scoreTotal - a.scoreTotal || a.catalogKey.localeCompare(b.catalogKey),
    );
  const rankedByFreshness = prioritizeUnseenCandidates(ranked, recentExclusions);
  const selected: typeof ranked = [];
  const deferred: typeof ranked = [];
  const genreCounts = new Map<string, number>();
  const primaryGenreLimit = Math.max(3, Math.ceil(limit / 2));
  for (const item of rankedByFreshness) {
    if ((genreCounts.get(item.primaryGenre) ?? 0) >= primaryGenreLimit) deferred.push(item);
    else {
      selected.push(item);
      genreCounts.set(
        item.primaryGenre,
        (genreCounts.get(item.primaryGenre) ?? 0) + 1,
      );
    }
  }
  return [...selected, ...deferred]
    .slice(0, limit)
    .map(({ primaryGenre: _primaryGenre, ...item }) => ({
      ...item,
      reasonCodes: recentExclusions.has(item.mediaItemId)
        ? [...item.reasonCodes, "Recently seen fallback used to complete the bracket"]
        : item.reasonCodes,
    }));
}

export async function getRecommendationDebug(db: Database, roomId: string) {
  const rows = await db
    .select({
      candidateId: candidates.id,
      sourceType: candidates.sourceType,
      seed: candidates.seed,
      scoreTotal: candidates.scoreTotal,
      scoreComponents: candidates.scoreComponents,
      reasonCodes: candidates.reasonCodes,
      supportCount: candidates.supportCount,
      catalogKey: mediaItems.catalogKey,
      title: mediaItems.title,
      mediaType: mediaItems.mediaType,
      releaseYear: mediaItems.releaseYear,
      runtimeMinutes: mediaItems.runtimeMinutes,
      genres: mediaItems.genres,
      metadata: mediaItems.metadata,
    })
    .from(candidates)
    .innerJoin(mediaItems, eq(candidates.mediaItemId, mediaItems.id))
    .where(eq(candidates.roomId, roomId));
  return rows.sort((a, b) => a.seed - b.seed);
}
