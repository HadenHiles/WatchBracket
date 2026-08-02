import { and, eq, isNull } from "drizzle-orm";
import { auditEvents, participants, rooms } from "@watch-bracket/db";
import { generateRoomCode, generateSessionToken, hashToken } from "@watch-bracket/shared";
import type { DomainContext } from "./domain.js";
import { DomainError, requireRoomHost } from "./domain.js";

export async function runItBack(ctx: DomainContext, participantId: string, roomId: string) {
  await requireRoomHost(ctx.db, participantId, roomId);
  const [source] = await ctx.db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!source || source.state !== "WINNER") throw new DomainError("REPLAY_NOT_READY", "Run It Back becomes available after a winner is crowned.", 409);
  const existing = await ctx.db.select({ id: rooms.id, code: rooms.code }).from(rooms).where(eq(rooms.replayOfRoomId, roomId)).limit(1);
  if (existing[0]) throw new DomainError("REPLAY_ALREADY_CREATED", "A replay room already exists.", 409, existing[0]);
  const crew = await ctx.db.select().from(participants).where(and(eq(participants.roomId, roomId), isNull(participants.removedAt)));
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateRoomCode(ctx.env.ROOM_CODE_LENGTH);
    const hostToken = generateSessionToken();
    try {
      return await ctx.db.transaction(async (tx) => {
        const [room] = await tx.insert(rooms).values({
          householdId: source.householdId,
          replayOfRoomId: source.id,
          code,
          name: source.name,
          rules: source.rules,
          randomSeed: generateSessionToken(),
          expiresAt: new Date(Date.now() + ctx.env.ROOM_TTL_HOURS * 3_600_000),
          version: 1,
        }).returning();
        const copied = [];
        for (const person of crew) {
          const token = person.id === participantId ? hostToken : generateSessionToken();
          const [next] = await tx.insert(participants).values({
            roomId: room!.id,
            normalizedNickname: person.normalizedNickname,
            displayNickname: person.displayNickname,
            role: person.id === participantId ? "HOST" : person.role === "HOST" ? "PARTICIPANT" : person.role,
            tokenHash: hashToken(token, ctx.env.PARTICIPANT_SESSION_PEPPER),
          }).returning();
          copied.push(next!);
        }
        const host = copied.find((person) => person.role === "HOST");
        if (!host) throw new DomainError("REPLAY_HOST_MISSING", "Could not carry the host into the replay room.", 500);
        await tx.update(rooms).set({ hostParticipantId: host.id }).where(eq(rooms.id, room!.id));
        await tx.insert(auditEvents).values({ householdId: source.householdId, roomId: room!.id, actorType: "PARTICIPANT", actorId: host.id, eventType: "REPLAY_ROOM_CREATED", metadata: { sourceRoomId: source.id, carriedParticipants: copied.length } });
        return { roomId: room!.id, code: room!.code, name: room!.name, participantCount: copied.length, token: hostToken };
      });
    } catch (error) {
      const candidate = error as { code?: string; cause?: { code?: string } };
      if ((candidate.cause?.code ?? candidate.code) === "23505") continue;
      throw error;
    }
  }
  throw new DomainError("ROOM_CODE_EXHAUSTED", "Could not allocate a replay room code. Try again.", 503);
}
