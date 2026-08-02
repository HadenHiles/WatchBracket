import { createHash } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import {
  candidates,
  households,
  mediaItems,
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

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const stableTie = (seed: string, key: string) =>
  parseInt(
    createHash("sha256").update(`${seed}:${key}`).digest("hex").slice(0, 6),
    16,
  ) / 0xffffff;

function scoreCandidate(
  candidate: RecommendationCandidate,
  directGenres: Map<string, number>,
  roomSeed: string,
  referenceYear: number,
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
  const diversity = clamp(1 - (directGenres.get(primaryGenre) ?? 0) / 3);
  const runtimeFit = item.runtimeMinutes
    ? clamp(1 - Math.abs(item.runtimeMinutes - 110) / 120)
    : 0;
  const age = referenceYear - item.releaseYear;
  const eraFit = age <= 5 ? 0.9 : age <= 20 ? 1 : 0.75;
  const novelty = clamp(1 - Math.log10(item.voteCount + 1) / 6);
  const householdFit = clamp(
    1 - Math.log10((item.householdHistoryScore ?? 0) + 1) / 3,
  );
  const requestable = item.requestAvailability?.requestable ? 1 : 0;
  const scoreComponents = {
    similarity,
    availableNow,
    clusterSupport,
    ratingConfidence,
    diversity,
    runtimeFit,
    eraFit,
    novelty,
    householdFit,
    requestable,
  };
  const weighted =
    similarity * 0.22 +
    availableNow * 0.18 +
    clusterSupport * 0.13 +
    ratingConfidence * 0.09 +
    diversity * 0.08 +
    runtimeFit * 0.06 +
    eraFit * 0.05 +
    novelty * 0.03 +
    householdFit * 0.06 +
    requestable * 0.02;
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
    diversity > 0.7 && primaryGenre !== "Unknown"
      ? `Adds ${primaryGenre.toLowerCase()} variety`
      : undefined,
    candidate.sourceKinds.includes("RECOMMENDATIONS")
      ? "Recommended by TMDB"
      : "Similar title from TMDB",
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
    })
    .from(submissions)
    .innerJoin(mediaItems, eq(submissions.mediaItemId, mediaItems.id))
    .where(eq(submissions.roomId, roomId));
  const seeds = [
    ...new Map(
      direct
        .filter(
          (item): item is typeof item & { tmdbId: number } =>
            item.tmdbId !== null,
        )
        .map((item) => [
          item.catalogKey,
          { tmdbId: item.tmdbId, mediaType: item.mediaType },
        ]),
    ).values(),
  ];
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
  const directGenres = new Map<string, number>();
  for (const item of direct) {
    const genre =
      Array.isArray(item.genres) && typeof item.genres[0] === "string"
        ? item.genres[0]
        : undefined;
    if (genre) directGenres.set(genre, (directGenres.get(genre) ?? 0) + 1);
  }
  const ranked = canonical
    .flatMap((candidate) => {
      const mediaItemId = idByKey.get(candidate.item.catalogKey);
      if (!mediaItemId || recentExclusions.has(mediaItemId)) return [];
      return [
        {
          mediaItemId,
          catalogKey: candidate.item.catalogKey,
          ...scoreCandidate(
            candidate,
            directGenres,
            room.randomSeed,
            room.createdAt.getUTCFullYear(),
          ),
        },
      ];
    })
    .sort(
      (a, b) =>
        b.scoreTotal - a.scoreTotal || a.catalogKey.localeCompare(b.catalogKey),
    );
  const selected: typeof ranked = [];
  const deferred: typeof ranked = [];
  const genreCounts = new Map<string, number>();
  for (const item of ranked) {
    if ((genreCounts.get(item.primaryGenre) ?? 0) >= 3) deferred.push(item);
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
    .map(({ primaryGenre: _primaryGenre, ...item }) => item);
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
