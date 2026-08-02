import { randomUUID } from 'node:crypto';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { auditEvents, mediaItems, participants, rooms, submissions } from '@watch-bracket/db';
import { mockCatalog, searchMockCatalog } from '@watch-bracket/mock-catalog';
import { HouseRulesSchema, type HouseRules } from '@watch-bracket/realtime-protocol';
import type { DomainContext } from './domain.js';
import { DomainError, requireRoomHost } from './domain.js';

export const HOUSE_RULE_PRESETS: Record<HouseRules['preset'], HouseRules> = {
  QUICK_PICK: { preset: 'QUICK_PICK', nominationDurationSeconds: 60, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' },
  MOVIE_NIGHT: { preset: 'MOVIE_NIGHT', nominationDurationSeconds: 120, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' },
  DEEP_DIVE: { preset: 'DEEP_DIVE', nominationDurationSeconds: 180, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' }
};

export async function seedMockCatalog(ctx: DomainContext) {
  for (const item of mockCatalog) {
    await ctx.db.insert(mediaItems).values({ ...item, originalTitle: item.title, genres: item.genres, metadata: { source: 'MOCK', deterministic: true } })
      .onConflictDoUpdate({ target: mediaItems.catalogKey, set: { mediaType: item.mediaType, title: item.title, originalTitle: item.title, releaseYear: item.releaseYear, runtimeMinutes: item.runtimeMinutes, contentRating: item.contentRating, genres: item.genres, synopsis: item.synopsis, updatedAt: new Date() } });
  }
}

export function searchCatalog(query: string, mediaType?: 'MOVIE' | 'TV') {
  return searchMockCatalog(query, mediaType);
}

export async function startNominations(ctx: DomainContext, participantId: string, roomId: string, input: HouseRules) {
  const rules = HouseRulesSchema.parse(input);
  await requireRoomHost(ctx.db, participantId, roomId);
  const deadline = new Date(Date.now() + rules.nominationDurationSeconds * 1000);
  const [room] = await ctx.db.update(rooms).set({ state: 'NOMINATING', lockedAt: new Date(), rules, randomSeed: randomUUID(), nominationDeadline: deadline, nominationsRevealedAt: null, version: sql`${rooms.version} + 1`, updatedAt: new Date() })
    .where(and(eq(rooms.id, roomId), eq(rooms.state, 'LOBBY'))).returning();
  if (!room) throw new DomainError('NOMINATIONS_ALREADY_STARTED', 'Nominations have already started.', 409);
  await ctx.db.update(participants).set({ ready: false }).where(and(eq(participants.roomId, roomId), isNull(participants.removedAt)));
  await ctx.db.insert(auditEvents).values({ householdId: room.householdId, roomId, actorType: 'PARTICIPANT', actorId: participantId, eventType: 'NOMINATIONS_STARTED', metadata: { preset: rules.preset, deadline: deadline.toISOString() } });
  return { room, deadline };
}

export async function submitNomination(ctx: DomainContext, participantId: string, roomId: string, rank: 1 | 2, catalogKey: string) {
  const [item] = await ctx.db.select().from(mediaItems).where(eq(mediaItems.catalogKey, catalogKey)).limit(1);
  if (!item) throw new DomainError('MEDIA_NOT_FOUND', 'That catalog title is unavailable.', 404);
  return ctx.db.transaction(async (tx) => {
    const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).for('update').limit(1);
    if (!room || room.state !== 'NOMINATING' || !room.nominationDeadline || room.nominationDeadline.getTime() <= Date.now()) throw new DomainError('NOMINATIONS_CLOSED', 'Nominations are closed.', 409);
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
    if (!room || room.state !== 'NOMINATING' || !room.nominationDeadline || room.nominationDeadline.getTime() <= Date.now()) throw new DomainError('NOMINATIONS_CLOSED', 'Nominations are closed.', 409);
    const [participant] = await tx.select({ id: participants.id }).from(participants).where(and(eq(participants.id, participantId), eq(participants.roomId, roomId), isNull(participants.removedAt))).limit(1);
    if (!participant) throw new DomainError('ROOM_SESSION_REQUIRED', 'A room-scoped session is required.', 401);
    if (ready) {
      const selected = await tx.select({ rank: submissions.rank }).from(submissions).where(and(eq(submissions.roomId, roomId), eq(submissions.participantId, participantId)));
      if (new Set(selected.map((item) => item.rank)).size !== 2) throw new DomainError('TWO_SUBMISSIONS_REQUIRED', 'Choose both ranked nominations before locking them in.', 409);
    }
    const now = new Date();
    await tx.update(participants).set({ ready }).where(eq(participants.id, participantId));
    await tx.update(submissions).set({ lockedAt: ready ? now : null }).where(and(eq(submissions.roomId, roomId), eq(submissions.participantId, participantId)));
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
  const [room] = await ctx.db.update(rooms).set({ state: 'NOMINATIONS_LOCKED', nominationsRevealedAt: now, version: sql`${rooms.version} + 1`, updatedAt: now })
    .where(and(eq(rooms.id, roomId), eq(rooms.state, 'NOMINATING'))).returning();
  if (!room) throw new DomainError('NOMINATIONS_CLOSED', 'Nominations are already closed.', 409);
  await ctx.db.insert(auditEvents).values({ householdId: room.householdId, roomId, actorType: 'PARTICIPANT', actorId: participantId, eventType: 'NOMINATIONS_REVEALED', metadata: { reason: 'HOST_ACTION' } });
  return room;
}
