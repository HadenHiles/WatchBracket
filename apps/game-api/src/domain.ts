import { createHash } from "node:crypto";
import {
  Algorithm,
  hash as hashPassword,
  verify as verifyPassword,
} from "@node-rs/argon2";
import { and, desc, eq, gt, isNull, ne, sql } from "drizzle-orm";
import type { Database } from "@watch-bracket/db";
import {
  adminSessions,
  adminUsers,
  auditEvents,
  castLaunchTokens,
  displayPairingCodes,
  displaySessions,
  households,
  idempotencyKeys,
  matchups,
  participants,
  rooms,
} from "@watch-bracket/db";
import {
  generatePairingCode,
  generateRoomCode,
  generateSessionToken,
  hashToken,
  isPairingCodeExpired,
  normalizeNickname,
} from "@watch-bracket/shared";
import type { GameApiEnv } from "./env.js";

export type DomainContext = { db: Database; env: GameApiEnv };
const lateVoterRoomStates = new Set([
  "NOMINATIONS_LOCKED",
  "MATCHUP_INTRO",
  "VOTING",
  "MATCHUP_RESULT",
  "WINNER",
]);
export const acceptsLateVoters = (state: string) =>
  lateVoterRoomStates.has(state);
export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export async function bootstrapAdmin({ db, env }: DomainContext) {
  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .limit(1);
  if (existing.length) return { created: false, adminId: existing[0]!.id };
  const passwordHash = await hashPassword(env.ADMIN_BOOTSTRAP_PASSWORD, {
    algorithm: Algorithm.Argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  return db.transaction(async (tx) => {
    const recheck = await tx
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .limit(1);
    if (recheck.length) return { created: false, adminId: recheck[0]!.id };
    const [admin] = await tx
      .insert(adminUsers)
      .values({ email: env.ADMIN_BOOTSTRAP_EMAIL, passwordHash })
      .returning({ id: adminUsers.id });
    await tx.insert(households).values({ name: "Watch Bracket Household" });
    return { created: true, adminId: admin!.id };
  });
}

export async function login(
  { db, env }: DomainContext,
  email: string,
  password: string,
) {
  const normalized = email.trim().toLowerCase();
  const [admin] = await db
    .select()
    .from(adminUsers)
    .where(eq(adminUsers.email, normalized))
    .limit(1);
  if (!admin || !(await verifyPassword(admin.passwordHash, password)))
    throw new DomainError(
      "INVALID_CREDENTIALS",
      "Invalid email or password.",
      401,
    );
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(adminSessions.adminUserId, admin.id),
          isNull(adminSessions.revokedAt),
        ),
      );
    await tx
      .insert(adminSessions)
      .values({
        adminUserId: admin.id,
        tokenHash: hashToken(token, env.HOST_SESSION_PEPPER),
        expiresAt,
      });
    await tx
      .update(adminUsers)
      .set({ lastLoginAt: new Date(), updatedAt: new Date() })
      .where(eq(adminUsers.id, admin.id));
  });
  return { admin: { id: admin.id, email: admin.email }, token, expiresAt };
}

export async function resolveAdmin({ db, env }: DomainContext, token?: string) {
  if (!token) return undefined;
  const [row] = await db
    .select({
      sessionId: adminSessions.id,
      adminId: adminUsers.id,
      email: adminUsers.email,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .where(
      and(
        eq(adminSessions.tokenHash, hashToken(token, env.HOST_SESSION_PEPPER)),
        isNull(adminSessions.revokedAt),
        gt(adminSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (row)
    await db
      .update(adminSessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(adminSessions.id, row.sessionId));
  return row;
}

export async function resolveParticipant(
  { db, env }: DomainContext,
  token?: string,
) {
  if (!token) return undefined;
  const [row] = await db
    .select()
    .from(participants)
    .where(
      and(
        eq(
          participants.tokenHash,
          hashToken(token, env.PARTICIPANT_SESSION_PEPPER),
        ),
        isNull(participants.removedAt),
      ),
    )
    .limit(1);
  return row;
}
export async function resolveDisplay(
  { db, env }: DomainContext,
  token?: string,
) {
  if (!token) return undefined;
  const [row] = await db
    .select()
    .from(displaySessions)
    .where(
      and(
        eq(
          displaySessions.tokenHash,
          hashToken(token, env.DISPLAY_SESSION_PEPPER),
        ),
        isNull(displaySessions.revokedAt),
        gt(displaySessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row;
}

export async function logout({ db, env }: DomainContext, token?: string) {
  if (token)
    await db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(
        eq(adminSessions.tokenHash, hashToken(token, env.HOST_SESSION_PEPPER)),
      );
}

const fingerprint = (body: unknown) =>
  createHash("sha256").update(JSON.stringify(body)).digest("hex");
function postgresError(error: unknown) {
  const outer = error as {
    code?: unknown;
    constraint_name?: unknown;
    constraint?: unknown;
    cause?: unknown;
  };
  const cause = outer?.cause as
    | { code?: unknown; constraint_name?: unknown; constraint?: unknown }
    | undefined;
  return {
    code: String(cause?.code ?? outer?.code ?? ""),
    constraint: String(
      cause?.constraint_name ??
        cause?.constraint ??
        outer?.constraint_name ??
        outer?.constraint ??
        "",
    ),
  };
}
export async function createRoom(
  ctx: DomainContext,
  creatorIdentifier: string,
  body: { name: string; hostNickname: string },
  idempotencyKey: string,
) {
  const { db, env } = ctx;
  const fp = fingerprint(body);
  const [prior] = await db
    .select()
    .from(idempotencyKeys)
    .where(
      and(
        eq(idempotencyKeys.scope, "ROOM_CREATE"),
        eq(idempotencyKeys.actorIdentifier, creatorIdentifier),
        eq(idempotencyKeys.key, idempotencyKey),
        gt(idempotencyKeys.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (prior) {
    if (prior.requestFingerprint !== fp)
      throw new DomainError(
        "IDEMPOTENCY_CONFLICT",
        "This idempotency key was used for another request.",
        409,
      );
    return { replayed: true, ...(prior.responseBody as { roomId: string }) };
  }
  const nickname = normalizeNickname(body.hostNickname);
  const household = (await db.select().from(households).limit(1))[0];
  if (!household)
    throw new DomainError(
      "HOUSEHOLD_MISSING",
      "Default household is not configured.",
      500,
    );
  for (let attempt = 0; attempt < 8; attempt++) {
    const token = generateSessionToken();
    const code = generateRoomCode(env.ROOM_CODE_LENGTH);
    try {
      const result = await db.transaction(async (tx) => {
        const [room] = await tx
          .insert(rooms)
          .values({
            householdId: household.id,
            code,
            name: body.name.trim(),
            rules: household.defaultRules,
            randomSeed: generateSessionToken(),
            expiresAt: new Date(Date.now() + env.ROOM_TTL_HOURS * 3_600_000),
            version: 1,
          })
          .returning();
        const [participant] = await tx
          .insert(participants)
          .values({
            roomId: room!.id,
            normalizedNickname: nickname.normalized,
            displayNickname: nickname.display,
            role: "HOST",
            tokenHash: hashToken(token, env.PARTICIPANT_SESSION_PEPPER),
          })
          .returning();
        await tx
          .update(rooms)
          .set({ hostParticipantId: participant!.id })
          .where(eq(rooms.id, room!.id));
        const responseBody = { roomId: room!.id };
        await tx
          .insert(idempotencyKeys)
          .values({
            scope: "ROOM_CREATE",
            actorIdentifier: creatorIdentifier,
            key: idempotencyKey,
            requestFingerprint: fp,
            responseStatus: 201,
            responseBody,
            expiresAt: new Date(Date.now() + 24 * 3_600_000),
          });
        await tx
          .insert(auditEvents)
          .values({
            householdId: household.id,
            roomId: room!.id,
            actorType: "PARTICIPANT",
            actorId: participant!.id,
            eventType: "ROOM_CREATED",
            metadata: { roomName: room!.name },
          });
        return { room: room!, participant: participant!, token };
      });
      return { replayed: false, roomId: result.room.id, ...result };
    } catch (error: unknown) {
      const databaseError = postgresError(error);
      if (
        databaseError.code === "23505" &&
        databaseError.constraint.includes("rooms_code")
      )
        continue;
      throw error;
    }
  }
  throw new DomainError(
    "ROOM_CODE_EXHAUSTED",
    "Could not allocate a room code. Try again.",
    503,
  );
}

export async function joinRoom(
  ctx: DomainContext,
  body: { roomCode: string; nickname: string },
  existingToken?: string,
) {
  const { db, env } = ctx;
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.code, body.roomCode.trim().toUpperCase()))
    .limit(1);
  if (!room || room.state === "EXPIRED")
    throw new DomainError("ROOM_UNAVAILABLE", "That room is unavailable.", 404);
  const existing = await resolveParticipant(ctx, existingToken);
  if (existing?.roomId === room.id) {
    await db
      .update(participants)
      .set({ lastSeenAt: new Date() })
      .where(eq(participants.id, existing.id));
    return { room, participant: existing, token: undefined, restored: true };
  }
  const nickname = normalizeNickname(body.nickname);
  if (
    existing &&
    room.replayOfRoomId === existing.roomId &&
    nickname.normalized === existing.normalizedNickname
  ) {
    const [reserved] = await db
      .select()
      .from(participants)
      .where(
        and(
          eq(participants.roomId, room.id),
          eq(participants.normalizedNickname, existing.normalizedNickname),
          isNull(participants.removedAt),
        ),
      )
      .limit(1);
    if (reserved) {
      const replayToken = generateSessionToken();
      const [claimed] = await db
        .update(participants)
        .set({
          tokenHash: hashToken(replayToken, env.PARTICIPANT_SESSION_PEPPER),
          lastSeenAt: new Date(),
        })
        .where(eq(participants.id, reserved.id))
        .returning();
      return { room, participant: claimed!, token: replayToken, restored: true };
    }
  }
  const acceptsLateJoin = acceptsLateVoters(room.state);
  if (room.state !== "LOBBY" && !acceptsLateJoin)
    throw new DomainError(
      "ROOM_IN_PROGRESS",
      "Nominations are already in progress. Join again when voting starts.",
      409,
    );
  if (room.state === "LOBBY" && room.lockedAt)
    throw new DomainError("ROOM_LOCKED", "This room is locked.", 423);
  const count = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(participants)
    .where(
      and(eq(participants.roomId, room.id), isNull(participants.removedAt)),
    );
  if ((count[0]?.count ?? 0) >= env.ROOM_MAX_PARTICIPANTS)
    throw new DomainError("ROOM_FULL", "This room is full.", 409);
  const token = generateSessionToken();
  try {
    const [participant] = await db.transaction(async (tx) => {
      const inserted = await tx
        .insert(participants)
        .values({
          roomId: room.id,
          normalizedNickname: nickname.normalized,
          displayNickname: nickname.display,
          tokenHash: hashToken(token, env.PARTICIPANT_SESSION_PEPPER),
        })
        .returning();
      const participant = inserted[0]!;
      if (acceptsLateJoin) {
        const [activeMatchup] = await tx
          .select()
          .from(matchups)
          .where(
            and(
              eq(matchups.roomId, room.id),
              isNull(matchups.advancedAt),
            ),
          )
          .orderBy(desc(matchups.sequence))
          .limit(1);
        const canJoinCurrentVote =
          activeMatchup?.status === "INTRO" ||
          (activeMatchup?.status === "VOTING" &&
            activeMatchup.votingEndsAt !== null &&
            activeMatchup.votingEndsAt.getTime() > Date.now());
        if (activeMatchup && canJoinCurrentVote) {
          const eligible = Array.isArray(activeMatchup.eligibleParticipantIds)
            ? activeMatchup.eligibleParticipantIds.filter(
                (id): id is string => typeof id === "string",
              )
            : [];
          await tx
            .update(matchups)
            .set({
              eligibleParticipantIds: [...new Set([...eligible, participant.id])],
            })
            .where(eq(matchups.id, activeMatchup.id));
        }
      }
      await tx
        .update(rooms)
        .set({ version: sql`${rooms.version} + 1`, updatedAt: new Date() })
        .where(eq(rooms.id, room.id));
      return inserted;
    });
    return { room, participant: participant!, token, restored: false };
  } catch (error: unknown) {
    if (postgresError(error).code === "23505")
      throw new DomainError(
        "NICKNAME_TAKEN",
        "That nickname is already in use.",
        409,
      );
    throw error;
  }
}

export async function requireRoomHost(
  db: Database,
  participantId: string,
  roomId: string,
) {
  const [room] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.id, roomId))
    .limit(1);
  if (!room || room.hostParticipantId !== participantId)
    throw new DomainError(
      "HOST_REQUIRED",
      "Room host authorization is required.",
      403,
    );
  return room;
}

export async function setRoomLock(
  db: Database,
  participantId: string,
  roomId: string,
  locked: boolean,
) {
  const room = await requireRoomHost(db, participantId, roomId);
  if (room.state !== "LOBBY")
    throw new DomainError("ROOM_NOT_ACTIVE", "The room is not active.", 409);
  const [updated] = await db
    .update(rooms)
    .set({
      lockedAt: locked ? new Date() : null,
      version: sql`${rooms.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(rooms.id, roomId))
    .returning();
  await db
    .insert(auditEvents)
    .values({
      householdId: room.householdId,
      roomId,
      actorType: "PARTICIPANT",
      actorId: participantId,
      eventType: locked ? "ROOM_LOCKED" : "ROOM_UNLOCKED",
    });
  return updated!;
}

export async function createDisplayPairingCode(
  ctx: DomainContext,
  participantId: string,
  roomId: string,
) {
  const room = await requireRoomHost(ctx.db, participantId, roomId);
  const code = generatePairingCode();
  const expiresAt = new Date(
    Date.now() + ctx.env.DISPLAY_PAIRING_TTL_SECONDS * 1000,
  );
  await ctx.db
    .insert(displayPairingCodes)
    .values({
      roomId,
      codeHash: hashToken(code, ctx.env.DISPLAY_SESSION_PEPPER),
      expiresAt,
    });
  await ctx.db
    .insert(auditEvents)
    .values({
      householdId: room.householdId,
      roomId,
      actorType: "PARTICIPANT",
      actorId: participantId,
      eventType: "DISPLAY_PAIRING_CODE_CREATED",
    });
  return { code, expiresAt };
}

export async function createCastLaunchToken(
  ctx: DomainContext,
  participantId: string,
  roomId: string,
) {
  const room = await requireRoomHost(ctx.db, participantId, roomId);
  const token = generateSessionToken();
  const expiresAt = new Date(
    Date.now() + ctx.env.CAST_LAUNCH_TOKEN_TTL_SECONDS * 1000,
  );
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(castLaunchTokens)
      .set({ consumedAt: new Date() })
      .where(
        and(
          eq(castLaunchTokens.roomId, roomId),
          isNull(castLaunchTokens.consumedAt),
        ),
      );
    await tx
      .insert(castLaunchTokens)
      .values({
        roomId,
        issuedToHostParticipantId: participantId,
        tokenHash: hashToken(token, ctx.env.DISPLAY_SESSION_PEPPER),
        protocolVersion: 1,
        expiresAt,
      });
    await tx
      .insert(auditEvents)
      .values({
        householdId: room.householdId,
        roomId,
        actorType: "PARTICIPANT",
        actorId: participantId,
        eventType: "CAST_LAUNCH_TOKEN_CREATED",
        metadata: { protocolVersion: 1 },
      });
  });
  return { token, expiresAt, protocolVersion: 1 as const };
}

export async function exchangeCastLaunchToken(
  ctx: DomainContext,
  body: { launchToken: string; protocolVersion: 1 },
) {
  const { db, env } = ctx;
  const launchHash = hashToken(body.launchToken, env.DISPLAY_SESSION_PEPPER);
  return db.transaction(async (tx) => {
    const [launch] = await tx
      .select()
      .from(castLaunchTokens)
      .where(eq(castLaunchTokens.tokenHash, launchHash))
      .for("update")
      .limit(1);
    if (!launch)
      throw new DomainError(
        "CAST_LAUNCH_TOKEN_INVALID",
        "The Cast launch token is invalid.",
        400,
      );
    if (launch.protocolVersion !== body.protocolVersion)
      throw new DomainError(
        "CAST_PROTOCOL_MISMATCH",
        "The receiver protocol is not supported.",
        409,
      );
    if (launch.consumedAt)
      throw new DomainError(
        "CAST_LAUNCH_TOKEN_USED",
        "The Cast launch token has already been used.",
        409,
      );
    if (launch.expiresAt.getTime() <= Date.now())
      throw new DomainError(
        "CAST_LAUNCH_TOKEN_EXPIRED",
        "The Cast launch token has expired.",
        410,
      );
    const [issuer] = await tx
      .select({
        id: participants.id,
        roomId: participants.roomId,
        role: participants.role,
      })
      .from(participants)
      .where(
        and(
          eq(participants.id, launch.issuedToHostParticipantId),
          isNull(participants.removedAt),
        ),
      )
      .limit(1);
    if (!issuer || issuer.roomId !== launch.roomId || issuer.role !== "HOST")
      throw new DomainError(
        "CAST_LAUNCH_TOKEN_INVALID",
        "The Cast launch token is invalid.",
        401,
      );
    const [room] = await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, launch.roomId), ne(rooms.state, "EXPIRED")))
      .limit(1);
    if (!room?.hostParticipantId || room.hostParticipantId !== issuer.id)
      throw new DomainError(
        "ROOM_UNAVAILABLE",
        "That room is unavailable.",
        404,
      );
    const existing = await tx
      .select({ id: displaySessions.id })
      .from(displaySessions)
      .where(
        and(
          eq(displaySessions.roomId, room.id),
          eq(displaySessions.kind, "CAST"),
          isNull(displaySessions.revokedAt),
          gt(displaySessions.expiresAt, new Date()),
        ),
      );
    if (existing.length)
      await tx
        .update(displaySessions)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(displaySessions.roomId, room.id),
            eq(displaySessions.kind, "CAST"),
            isNull(displaySessions.revokedAt),
          ),
        );
    const displayToken = generateSessionToken();
    const [display] = await tx
      .insert(displaySessions)
      .values({
        roomId: room.id,
        kind: "CAST",
        displayName: "Cast display",
        tokenHash: hashToken(displayToken, env.DISPLAY_SESSION_PEPPER),
        pairedByParticipantId: room.hostParticipantId,
        expiresAt: room.expiresAt,
      })
      .returning();
    await tx
      .update(castLaunchTokens)
      .set({ consumedAt: new Date(), receiverSessionId: display!.id })
      .where(eq(castLaunchTokens.id, launch.id));
    await tx
      .update(rooms)
      .set({ version: sql`${rooms.version} + 1`, updatedAt: new Date() })
      .where(eq(rooms.id, room.id));
    await tx
      .insert(auditEvents)
      .values({
        householdId: room.householdId,
        roomId: room.id,
        actorType: "PARTICIPANT",
        actorId: room.hostParticipantId,
        eventType: "CAST_RECEIVER_PAIRED",
        metadata: { displaySessionId: display!.id, protocolVersion: 1 },
      });
    return {
      display: display!,
      token: displayToken,
      replacedDisplaySessionIds: existing.map((item) => item.id),
    };
  });
}

export async function pairDisplay(
  ctx: DomainContext,
  body: { pairingCode: string; displayName: string },
) {
  const { db, env } = ctx;
  const codeHash = hashToken(
    body.pairingCode.trim(),
    env.DISPLAY_SESSION_PEPPER,
  );
  const outcome = await db.transaction(async (tx) => {
    const [pairing] = await tx
      .select()
      .from(displayPairingCodes)
      .where(eq(displayPairingCodes.codeHash, codeHash))
      .for("update")
      .limit(1);
    if (!pairing)
      return {
        error: new DomainError(
          "PAIRING_CODE_INVALID",
          "The pairing code is invalid.",
          400,
        ),
      };
    await tx
      .update(displayPairingCodes)
      .set({ attemptCount: sql`${displayPairingCodes.attemptCount} + 1` })
      .where(eq(displayPairingCodes.id, pairing.id));
    if (pairing.consumedAt)
      return {
        error: new DomainError(
          "PAIRING_CODE_USED",
          "The pairing code has already been used.",
          409,
        ),
      };
    if (isPairingCodeExpired(pairing.expiresAt))
      return {
        error: new DomainError(
          "PAIRING_CODE_EXPIRED",
          "The pairing code has expired.",
          410,
        ),
      };
    if (pairing.attemptCount >= 5)
      return {
        error: new DomainError(
          "PAIRING_CODE_ATTEMPTS_EXCEEDED",
          "Too many pairing attempts.",
          429,
        ),
      };
    const [room] = await tx
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, pairing.roomId), ne(rooms.state, "EXPIRED")))
      .limit(1);
    if (!room?.hostParticipantId)
      return {
        error: new DomainError(
          "ROOM_UNAVAILABLE",
          "That room is unavailable.",
          404,
        ),
      };
    const token = generateSessionToken();
    const expiresAt = new Date(
      Math.min(room.expiresAt.getTime(), Date.now() + 24 * 3_600_000),
    );
    const [display] = await tx
      .insert(displaySessions)
      .values({
        roomId: room.id,
        displayName: body.displayName.trim(),
        tokenHash: hashToken(token, env.DISPLAY_SESSION_PEPPER),
        pairedByParticipantId: room.hostParticipantId,
        expiresAt,
      })
      .returning();
    await tx
      .update(displayPairingCodes)
      .set({ consumedAt: new Date() })
      .where(eq(displayPairingCodes.id, pairing.id));
    await tx
      .update(rooms)
      .set({ version: sql`${rooms.version} + 1` })
      .where(eq(rooms.id, room.id));
    await tx
      .insert(auditEvents)
      .values({
        householdId: room.householdId,
        roomId: room.id,
        actorType: "PARTICIPANT",
        actorId: room.hostParticipantId,
        eventType: "DISPLAY_PAIRED",
        metadata: { displaySessionId: display!.id, kind: "BROWSER" },
      });
    return { display: display!, token };
  });
  if ("error" in outcome) throw outcome.error;
  return outcome;
}

export async function revokeDisplay(
  db: Database,
  participantId: string,
  displaySessionId: string,
) {
  const [display] = await db
    .select()
    .from(displaySessions)
    .where(eq(displaySessions.id, displaySessionId))
    .limit(1);
  if (!display)
    throw new DomainError(
      "DISPLAY_NOT_FOUND",
      "Display session not found.",
      404,
    );
  const room = await requireRoomHost(db, participantId, display.roomId);
  await db.transaction(async (tx) => {
    await tx
      .update(displaySessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(displaySessions.id, display.id),
          isNull(displaySessions.revokedAt),
        ),
      );
    await tx
      .update(rooms)
      .set({ version: sql`${rooms.version} + 1` })
      .where(eq(rooms.id, room.id));
    await tx
      .insert(auditEvents)
      .values({
        householdId: room.householdId,
        roomId: room.id,
        actorType: "PARTICIPANT",
        actorId: participantId,
        eventType: "DISPLAY_REVOKED",
        metadata: { displaySessionId },
      });
  });
  return display;
}

export async function bumpRoomVersion(db: Database, roomId: string) {
  const [room] = await db
    .update(rooms)
    .set({ version: sql`${rooms.version} + 1`, updatedAt: new Date() })
    .where(eq(rooms.id, roomId))
    .returning({ version: rooms.version });
  return room?.version;
}
