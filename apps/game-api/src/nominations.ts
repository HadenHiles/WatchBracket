import { createHash, randomUUID } from 'node:crypto';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { auditEvents, availabilitySnapshots, households, mediaItems, participants, rooms, submissions } from '@watch-bracket/db';
import { mockCatalog, searchMockCatalog, searchSeededCatalogSnapshot, seededCatalogSnapshot, seededCatalogSnapshotCapturedAt } from '@watch-bracket/mock-catalog';
import type { CanonicalMediaItem } from '@watch-bracket/provider-contracts';
import { HouseRulesSchema, type HouseRules } from '@watch-bracket/realtime-protocol';
import type { DomainContext } from './domain.js';
import { DomainError, requireRoomHost } from './domain.js';
import { detailsFromTmdb, enrichWithHouseholdProviders, getPlexWatchlist, getTautulliHistory, recommendFromTmdb, searchTmdb } from './providers.js';
import { eligibilityFailures } from './eligibility.js';

export const HOUSE_RULE_PRESETS: Record<HouseRules['preset'], HouseRules> = {
  QUICK_PICK: { preset: 'QUICK_PICK', nominationDurationSeconds: 60, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' },
  MOVIE_NIGHT: { preset: 'MOVIE_NIGHT', nominationDurationSeconds: 120, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' },
  DEEP_DIVE: { preset: 'DEEP_DIVE', nominationDurationSeconds: 180, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' }
};

export const pausedNominationSeconds = (deadline: Date, now: Date) =>
  Math.max(1, Math.ceil((deadline.getTime() - now.getTime()) / 1000));

export const restoredNominationDeadline = (now: Date, pausedSeconds: number) =>
  new Date(now.getTime() + Math.max(1, pausedSeconds) * 1000);

export const absoluteCatalogArtwork = (publicAppUrl: string, posterUrl: string | undefined) =>
  posterUrl ? new URL(posterUrl, publicAppUrl).toString() : undefined;

export async function seedMockCatalog(ctx: DomainContext) {
  for (const item of [...mockCatalog, ...seededCatalogSnapshot]) {
    const sourceTmdbId = 'sourceTmdbId' in item ? item.sourceTmdbId : undefined;
    const metadata = {
      source: sourceTmdbId ? 'TMDB_SNAPSHOT' : 'MOCK',
      deterministic: true,
      ...(sourceTmdbId ? { sourceTmdbId, snapshotCapturedAt: seededCatalogSnapshotCapturedAt } : {}),
      ...('availability' in item && item.availability ? { availability: item.availability } : {}),
    };
    const values = {
      catalogKey: item.catalogKey,
      mediaType: item.mediaType,
      title: item.title,
      originalTitle: item.title,
      releaseYear: item.releaseYear,
      runtimeMinutes: item.runtimeMinutes,
      contentRating: item.contentRating,
      genres: item.genres,
      synopsis: item.synopsis,
      posterUrl: absoluteCatalogArtwork(ctx.env.PUBLIC_APP_URL, item.posterUrl) ?? null,
      metadata,
    };
    await ctx.db.insert(mediaItems).values(values)
      .onConflictDoUpdate({ target: mediaItems.catalogKey, set: { ...values, updatedAt: new Date() } });
  }
}

export async function cacheTmdbItems(ctx: DomainContext, items: CanonicalMediaItem[], cachedUntil: string, roomId?: string) {
  for (const item of items) {
    const [stored] = await ctx.db.insert(mediaItems).values({
      catalogKey: item.catalogKey, tmdbId: item.tmdbId, mediaType: item.mediaType, title: item.title, originalTitle: item.originalTitle, releaseDate: item.releaseDate, releaseYear: item.releaseYear,
      runtimeMinutes: item.runtimeMinutes, contentRating: item.contentRating, genres: item.genres, synopsis: item.synopsis, posterUrl: item.posterUrl,
      backdropUrl: item.backdropUrl, metadataExpiresAt: new Date(cachedUntil),
      metadata: { source: 'TMDB', tmdbId: item.tmdbId, originalLanguage: item.originalLanguage, releaseDate: item.releaseDate, backdropUrl: item.backdropUrl, popularity: item.popularity, voteAverage: item.voteAverage, voteCount: item.voteCount, adult: item.adult, availability: item.availability, localAvailability: item.localAvailability, requestAvailability: item.requestAvailability, householdHistoryScore: item.householdHistoryScore, metadataExpiresAt: cachedUntil }
    }).onConflictDoUpdate({ target: mediaItems.catalogKey, set: {
      tmdbId: item.tmdbId, mediaType: item.mediaType, title: item.title, originalTitle: item.originalTitle, releaseDate: item.releaseDate, releaseYear: item.releaseYear, runtimeMinutes: item.runtimeMinutes,
      contentRating: item.contentRating, genres: item.genres, synopsis: item.synopsis, posterUrl: item.posterUrl,
      backdropUrl: item.backdropUrl, metadataExpiresAt: new Date(cachedUntil), metadata: { source: 'TMDB', tmdbId: item.tmdbId, originalLanguage: item.originalLanguage, releaseDate: item.releaseDate, backdropUrl: item.backdropUrl, popularity: item.popularity, voteAverage: item.voteAverage, voteCount: item.voteCount, adult: item.adult, availability: item.availability, localAvailability: item.localAvailability, requestAvailability: item.requestAvailability, householdHistoryScore: item.householdHistoryScore, metadataExpiresAt: cachedUntil }, updatedAt: new Date()
    } }).returning({ id: mediaItems.id });
    if (stored) await ctx.db.insert(availabilitySnapshots).values({ roomId, mediaItemId: stored.id, sourceType: 'TMDB_WATCH_PROVIDERS', sourceId: item.availability.region, status: item.availability.offers.length ? 'AVAILABLE' : 'NONE_FOUND', details: item.availability, expiresAt: new Date(cachedUntil) });
  }
}

export async function searchCatalog(ctx: DomainContext, roomId: string, query: string, mediaType?: 'MOVIE' | 'TV', autocomplete = false, useSeededSnapshot = false) {
  const [room] = await ctx.db.select({ rules: rooms.rules, householdId: rooms.householdId }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) throw new DomainError('ROOM_NOT_FOUND', 'Room not found.', 404);
  const [household]=await ctx.db.select({region:households.region}).from(households).where(eq(households.id,room.householdId)).limit(1);
  const rules = HouseRulesSchema.parse(room.rules);
  if (useSeededSnapshot) {
    return {
      source: 'MOCK' as const,
      warning: 'Automated client detected; using the deterministic catalog snapshot.',
      items: searchSeededCatalogSnapshot(query, mediaType)
        .filter((item) => eligibilityFailures(item, rules).length === 0)
        .map((item) => ({
          ...item,
          posterUrl: absoluteCatalogArtwork(ctx.env.PUBLIC_APP_URL, item.posterUrl),
        })),
    };
  }
  try {
    const result = await searchTmdb(ctx, { query, mediaType, region: household?.region??'CA', limit: autocomplete ? 8 : 12 });
    const enriched = autocomplete && (rules.availabilityMode ?? 'ANY') === 'ANY'
      ? result.items
      : await enrichWithHouseholdProviders(ctx, result.items);
    const valid = enriched.filter((item) => eligibilityFailures(item, rules).length === 0);
    await cacheTmdbItems(ctx, valid, result.cachedUntil);
    return { source: 'TMDB' as const, items: valid.map((item) => ({ catalogKey: item.catalogKey, mediaType: item.mediaType, title: item.title, releaseYear: item.releaseYear, runtimeMinutes: item.runtimeMinutes!, contentRating: item.contentRating ?? 'Unrated', genres: item.genres, synopsis: item.synopsis, posterUrl: item.posterUrl, availability: item.availability, localAvailability: item.localAvailability, requestAvailability: item.requestAvailability })) };
  } catch (error) {
    if (ctx.env.NODE_ENV === 'production') throw error;
    return { source: 'MOCK' as const, warning: 'TMDB is unavailable; using the deterministic development catalog.', items: searchMockCatalog(query, mediaType).filter((item)=>eligibilityFailures(item,rules).length===0) };
  }
}

export async function plexWatchlistSuggestions(ctx: DomainContext, roomId: string, participantId: string) {
  const [room] = await ctx.db.select({ rules: rooms.rules, householdId: rooms.householdId }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) throw new DomainError('ROOM_NOT_FOUND', 'Room not found.', 404);
  const [household] = await ctx.db.select({ region: households.region }).from(households).where(eq(households.id, room.householdId)).limit(1);
  const rules = HouseRulesSchema.parse(room.rules);
  const result = await getPlexWatchlist(ctx, participantId, household?.region ?? 'CA');
  const enriched = await enrichWithHouseholdProviders(ctx, result.items);
  const valid = enriched.filter((item) => eligibilityFailures(item, rules).length === 0);
  const cachedUntil = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
  await cacheTmdbItems(ctx, valid, cachedUntil, roomId);
  return { source: 'PLEX' as const, items: valid.map((item) => ({ catalogKey: item.catalogKey, mediaType: item.mediaType, title: item.title, releaseYear: item.releaseYear, runtimeMinutes: item.runtimeMinutes!, contentRating: item.contentRating ?? 'Unrated', genres: item.genres, synopsis: item.synopsis, posterUrl: item.posterUrl, availability: item.availability, localAvailability: item.localAvailability, requestAvailability: item.requestAvailability })) };
}

const suggestionDto = (item: CanonicalMediaItem) => ({
  catalogKey: item.catalogKey,
  mediaType: item.mediaType,
  title: item.title,
  releaseYear: item.releaseYear,
  runtimeMinutes: item.runtimeMinutes ?? 0,
  contentRating: item.contentRating ?? 'Unrated',
  genres: item.genres,
  synopsis: item.synopsis,
  posterUrl: item.posterUrl,
  availability: item.availability,
  localAvailability: item.localAvailability,
  requestAvailability: item.requestAvailability,
});

export function selectVariedSuggestions<T extends { catalogKey: string }>(
  items: T[],
  seed: string,
  limit: number,
) {
  return [...items]
    .sort((left, right) => {
      const leftScore = createHash('sha256')
        .update(`${seed}:${left.catalogKey}`)
        .digest('hex');
      const rightScore = createHash('sha256')
        .update(`${seed}:${right.catalogKey}`)
        .digest('hex');
      return leftScore.localeCompare(rightScore) || left.catalogKey.localeCompare(right.catalogKey);
    })
    .slice(0, Math.max(0, limit));
}

export async function plexPersonalizedSuggestions(ctx: DomainContext, roomId: string, participantId: string) {
  const [room] = await ctx.db.select({ rules: rooms.rules, householdId: rooms.householdId, randomSeed: rooms.randomSeed }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) throw new DomainError('ROOM_NOT_FOUND', 'Room not found.', 404);
  const [household] = await ctx.db.select({ region: households.region }).from(households).where(eq(households.id, room.householdId)).limit(1);
  const region = household?.region ?? 'CA';
  const rules = HouseRulesSchema.parse(room.rules);
  const [watchlistResult, historyResult] = await Promise.all([
    getPlexWatchlist(ctx, participantId, region),
    getTautulliHistory(ctx, 300).catch(() => ({ items: [] })),
  ]);
  const watchlist = (await enrichWithHouseholdProviders(ctx, watchlistResult.items))
    .filter((item) => eligibilityFailures(item, rules).length === 0);
  const preferenceSeeds = [
    ...watchlist.slice(0, 10).map(({ tmdbId, mediaType }) => ({ tmdbId, mediaType })),
    ...historyResult.items.flatMap((item) => item.tmdbId && item.mediaType ? [{ tmdbId: item.tmdbId, mediaType: item.mediaType }] : []).slice(0, 6),
  ];
  const seeds = [...new Map(preferenceSeeds.map((item) => [`${item.mediaType}:${item.tmdbId}`, item])).values()].slice(0, 16);
  let recommended: CanonicalMediaItem[] = [];
  if (seeds.length) {
    const result = await recommendFromTmdb(ctx, { seeds, region, limit: 20 });
    const watchlistKeys = new Set(watchlist.map((item) => item.catalogKey));
    const recommendationPool = (await enrichWithHouseholdProviders(ctx, result.candidates.map((candidate) => candidate.item)))
      .filter((item) => !watchlistKeys.has(item.catalogKey) && eligibilityFailures(item, rules).length === 0);
    recommended = selectVariedSuggestions(
      recommendationPool,
      `${room.randomSeed}:${participantId}:recommended`,
      12,
    );
    await cacheTmdbItems(ctx, recommended, result.cachedUntil, roomId);
  }
  await cacheTmdbItems(ctx, watchlist, new Date(Date.now() + 6 * 60 * 60_000).toISOString(), roomId);
  return {
    source: 'PLEX' as const,
    watchlist: selectVariedSuggestions(
      watchlist,
      `${room.randomSeed}:${participantId}:watchlist`,
      12,
    ).map(suggestionDto),
    recommended: recommended.map(suggestionDto),
    tasteSource: historyResult.items.length ? 'PLEX_AND_TAUTULLI' as const : 'PLEX' as const,
  };
}

export async function startNominations(ctx: DomainContext, participantId: string, roomId: string, input: HouseRules) {
  const rules = HouseRulesSchema.parse(input);
  await requireRoomHost(ctx.db, participantId, roomId);
  const deadline = new Date(Date.now() + rules.nominationDurationSeconds * 1000);
  const [room] = await ctx.db.update(rooms).set({ state: 'NOMINATING', lockedAt: new Date(), rules, randomSeed: randomUUID(), nominationDeadline: deadline, nominationAutoStartAt: null, nominationPausedSeconds: null, nominationsRevealedAt: null, version: sql`${rooms.version} + 1`, updatedAt: new Date() })
    .where(and(eq(rooms.id, roomId), eq(rooms.state, 'LOBBY'))).returning();
  if (!room) throw new DomainError('NOMINATIONS_ALREADY_STARTED', 'Nominations have already started.', 409);
  await ctx.db.update(participants).set({ ready: false }).where(and(eq(participants.roomId, roomId), isNull(participants.removedAt)));
  await ctx.db.insert(auditEvents).values({ householdId: room.householdId, roomId, actorType: 'PARTICIPANT', actorId: participantId, eventType: 'NOMINATIONS_STARTED', metadata: { preset: rules.preset, deadline: deadline.toISOString() } });
  return { room, deadline };
}

export async function submitNomination(ctx: DomainContext, participantId: string, roomId: string, rank: 1 | 2, catalogKey: string) {
  let [item] = await ctx.db.select().from(mediaItems).where(eq(mediaItems.catalogKey, catalogKey)).limit(1);
  if (!item) throw new DomainError('MEDIA_NOT_FOUND', 'That catalog title is unavailable.', 404);
  if (item.tmdbId) {
    try {
      const [room] = await ctx.db.select({ householdId: rooms.householdId }).from(rooms).where(eq(rooms.id, roomId)).limit(1);
      const [household] = room ? await ctx.db.select({ region: households.region }).from(households).where(eq(households.id, room.householdId)).limit(1) : [];
      const details = await detailsFromTmdb(ctx, { tmdbId: item.tmdbId, mediaType: item.mediaType, region: household?.region ?? 'CA' });
      const enriched = await enrichWithHouseholdProviders(ctx, [details.item]);
      await cacheTmdbItems(ctx, enriched, details.cachedUntil, roomId);
      [item] = await ctx.db.select().from(mediaItems).where(eq(mediaItems.catalogKey, catalogKey)).limit(1);
    } catch {
      // A transient provider failure must not discard an otherwise valid pick.
    }
  }
  if (!item) throw new DomainError('MEDIA_NOT_FOUND', 'That catalog title is unavailable.', 404);
  return ctx.db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).for('update').limit(1);
    if (!room || room.state !== 'NOMINATING' || !room.nominationDeadline || room.nominationDeadline.getTime() <= Date.now()) throw new DomainError('NOMINATIONS_CLOSED', 'Nominations are closed.', 409);
    const failures=eligibilityFailures(item,HouseRulesSchema.parse(room.rules));if(failures.length)throw new DomainError('MEDIA_INELIGIBLE','That title does not match this room\'s hard filters.',409,{failures});
    const [participant] = await tx.select({ id: participants.id }).from(participants).where(and(eq(participants.id, participantId), eq(participants.roomId, roomId), isNull(participants.removedAt))).limit(1);
    if (!participant) throw new DomainError('ROOM_SESSION_REQUIRED', 'A room-scoped session is required.', 401);
    const [duplicate] = await tx.select({ id: submissions.id }).from(submissions).where(and(eq(submissions.roomId, roomId), eq(submissions.participantId, participantId), eq(submissions.mediaItemId, item.id), ne(submissions.rank, rank))).limit(1);
    if (duplicate) throw new DomainError('DUPLICATE_SUBMISSION', 'Choose two different titles.', 409);
    const [submission] = await tx.insert(submissions).values({ roomId, participantId, mediaItemId: item.id, rank })
      .onConflictDoUpdate({ target: [submissions.roomId, submissions.participantId, submissions.rank], set: { mediaItemId: item.id, lockedAt: null, updatedAt: new Date() } }).returning();
    await tx.update(participants).set({ ready: false }).where(eq(participants.id, participantId));
    await tx.update(submissions).set({ lockedAt: null }).where(and(eq(submissions.roomId, roomId), eq(submissions.participantId, participantId)));
    await tx.update(rooms).set({ version: sql`${rooms.version} + 1`, updatedAt: new Date() }).where(eq(rooms.id, roomId));
    return submission!;
  });
}

export async function setNominationsReady(ctx: DomainContext, participantId: string, roomId: string, ready: boolean) {
  await ctx.db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).for('update').limit(1);
    const now = new Date();
    const nominationTimerOpen =
      room?.nominationAutoStartAt !== null ||
      (room?.nominationDeadline !== null && room.nominationDeadline.getTime() > now.getTime());
    if (!room || room.state !== 'NOMINATING' || !nominationTimerOpen) throw new DomainError('NOMINATIONS_CLOSED', 'Nominations are closed.', 409);
    const [participant] = await tx.select({ id: participants.id }).from(participants).where(and(eq(participants.id, participantId), eq(participants.roomId, roomId), isNull(participants.removedAt))).limit(1);
    if (!participant) throw new DomainError('ROOM_SESSION_REQUIRED', 'A room-scoped session is required.', 401);
    if (ready && room.nominationAutoStartAt) return;
    if (ready) {
      const selected = await tx.select({ rank: submissions.rank }).from(submissions).where(and(eq(submissions.roomId, roomId), eq(submissions.participantId, participantId)));
      if (new Set(selected.map((item) => item.rank)).size !== 2) throw new DomainError('TWO_SUBMISSIONS_REQUIRED', 'Choose both ranked nominations before locking them in.', 409);
    }
    await tx.update(participants).set({ ready }).where(eq(participants.id, participantId));
    await tx.update(submissions).set({ lockedAt: ready ? now : null }).where(and(eq(submissions.roomId, roomId), eq(submissions.participantId, participantId)));
    if (!ready && room.nominationAutoStartAt) {
      const restoredDeadline = restoredNominationDeadline(
        now,
        room.nominationPausedSeconds ?? 1,
      );
      await tx.update(rooms).set({ nominationDeadline: restoredDeadline, nominationAutoStartAt: null, nominationPausedSeconds: null, version: sql`${rooms.version} + 1`, updatedAt: now }).where(eq(rooms.id, roomId));
      return;
    }
    if (ready && room.nominationDeadline) {
      const [progress] = await tx.select({
        total: sql<number>`count(*)::int`,
        ready: sql<number>`count(*) filter (where ${participants.ready})::int`,
      }).from(participants).where(and(eq(participants.roomId, roomId), isNull(participants.removedAt), ne(participants.role, 'SPECTATOR')));
      if ((progress?.total ?? 0) > 0 && progress?.ready === progress?.total) {
        const pausedSeconds = pausedNominationSeconds(room.nominationDeadline, now);
        await tx.update(rooms).set({ nominationDeadline: null, nominationAutoStartAt: new Date(now.getTime() + 10_000), nominationPausedSeconds: pausedSeconds, version: sql`${rooms.version} + 1`, updatedAt: now }).where(eq(rooms.id, roomId));
        return;
      }
    }
    await tx.update(rooms).set({ version: sql`${rooms.version} + 1`, updatedAt: now }).where(eq(rooms.id, roomId));
  });
}

export async function extendNominations(ctx: DomainContext, participantId: string, roomId: string, seconds: number) {
  await requireRoomHost(ctx.db, participantId, roomId);
  const [room] = await ctx.db.update(rooms).set({ nominationDeadline: sql`${rooms.nominationDeadline} + (${seconds} * interval '1 second')`, version: sql`${rooms.version} + 1`, updatedAt: new Date() })
    .where(and(eq(rooms.id, roomId), eq(rooms.state, 'NOMINATING'))).returning();
  if (!room?.nominationDeadline) throw new DomainError('NOMINATIONS_CLOSED', 'Nominations are closed.', 409);
  await ctx.db.insert(auditEvents).values({ householdId: room.householdId, roomId, actorType: 'PARTICIPANT', actorId: participantId, eventType: 'NOMINATIONS_EXTENDED', metadata: { seconds, deadline: room.nominationDeadline.toISOString() } });
  return room.nominationDeadline;
}

export async function closeNominations(ctx: DomainContext, participantId: string, roomId: string) {
  await requireRoomHost(ctx.db, participantId, roomId);
  const now = new Date();
  const [room] = await ctx.db.update(rooms).set({ state: 'NOMINATIONS_LOCKED', nominationAutoStartAt: null, nominationPausedSeconds: null, nominationsRevealedAt: now, version: sql`${rooms.version} + 1`, updatedAt: now })
    .where(and(eq(rooms.id, roomId), eq(rooms.state, 'NOMINATING'))).returning();
  if (!room) throw new DomainError('NOMINATIONS_CLOSED', 'Nominations are already closed.', 409);
  await ctx.db.insert(auditEvents).values({ householdId: room.householdId, roomId, actorType: 'PARTICIPANT', actorId: participantId, eventType: 'NOMINATIONS_REVEALED', metadata: { reason: 'HOST_ACTION' } });
  return room;
}
