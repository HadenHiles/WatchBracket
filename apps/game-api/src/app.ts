import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { eq, sql } from "drizzle-orm";
import Fastify, { type FastifyRequest } from "fastify";
import { z } from "zod";
import {
  auditEvents,
  candidates,
  createDatabase,
  mediaItems,
  participants,
  rooms,
  tournaments,
} from "@watch-bracket/db";
import { HouseRulesSchema } from "@watch-bracket/realtime-protocol";
import {
  apiError,
  generateSessionToken,
  hashToken,
} from "@watch-bracket/shared";
import {
  bootstrapAdmin,
  createCastLaunchToken,
  createDisplayPairingCode,
  createRoom,
  DomainError,
  exchangeCastLaunchToken,
  joinRoom,
  login,
  logout,
  pairDisplay,
  resolveAdmin,
  resolveDisplay,
  resolveParticipant,
  revokeDisplay,
  setRoomLock,
} from "./domain.js";
import type { GameApiEnv } from "./env.js";
import { createRealtime, type RealtimeRuntime } from "./realtime.js";
import {
  COOKIE,
  allowedOrigin,
  cookieOptions,
  issueCsrf,
  verifyCsrf,
} from "./security.js";
import { getSnapshot } from "./snapshots.js";
import { startExpirationScheduler } from "./scheduler.js";
import {
  closeNominations,
  extendNominations,
  searchCatalog,
  plexWatchlistSuggestions,
  seedMockCatalog,
  setNominationsReady,
  startNominations,
  submitNomination,
} from "./nominations.js";
import { getHouseholdSetup, saveHouseholdSetup } from "./setup.js";
import {
  extendVoting,
  processTournamentTransition,
  skipPresentation,
  startTournament,
  submitVote,
} from "./tournament.js";
import { getRecommendationDebug } from "./recommendations.js";
import {
  getPlexAuthStatus,
  requestFromSeerr,
  startPlexAuth,
  unlinkPlex,
} from "./providers.js";
import { clearHouseholdHistory } from "./history.js";
import { runItBack } from "./replay.js";

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(256),
});
const CreateRoomSchema = z.object({
  name: z.string().trim().min(1).max(80),
  hostNickname: z.string().min(1).max(64),
});
const JoinRoomSchema = z.object({
  roomCode: z.string().min(4).max(10),
  nickname: z.string().min(1).max(64),
});
const PairDisplaySchema = z.object({
  pairingCode: z.string().min(4).max(10),
  displayName: z.string().trim().min(1).max(64).default("Shared display"),
});
const CastExchangeSchema = z.object({
  launchToken: z.string().min(32).max(256),
  protocolVersion: z.literal(1),
});
const SetupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  region: z.string().trim().min(2).max(8),
  timeZone: z.string().trim().min(1).max(64),
  defaultRules: HouseRulesSchema,
  historyEnabled: z.boolean().default(true),
  recentExclusionDays: z.number().int().min(0).max(365).default(30),
  completed: z.boolean(),
});
const CatalogQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  mediaType: z.enum(["MOVIE", "TV"]).optional(),
  autocomplete: z.literal("true").optional().transform(Boolean),
});
const StartNominationsSchema = z.object({ rules: HouseRulesSchema });
const ExtendNominationsSchema = z.object({
  seconds: z.number().int().min(30).max(300),
});
const SubmitNominationSchema = z.object({
  catalogKey: z.string().min(1).max(128),
});
const StartTournamentSchema = z.object({
  format: z.union([z.literal(8), z.literal(12), z.literal(16)]),
  voteDurationSeconds: z.number().int().min(10).max(120),
});
const VoteSchema = z
  .object({
    candidateId: z.uuid().optional(),
    abstain: z.boolean().default(false),
  })
  .refine((value) => value.abstain !== Boolean(value.candidateId), {
    message: "Choose a candidate or abstain.",
  });
const WinnerRequestSchema = z.object({
  confirm: z.literal(true),
  tvSeasonPolicy: z.enum(["FIRST", "LATEST", "ALL"]).optional(),
});
const ParamsRoomSchema = z.object({ roomId: z.uuid() });
const ParamsDisplaySchema = z.object({ displaySessionId: z.uuid() });
const ParamsSubmissionSchema = z.object({
  roomId: z.uuid(),
  rank: z.coerce.number().int().min(1).max(2),
});
const ParamsMatchupSchema = z.object({ matchupId: z.uuid() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new DomainError("VALIDATION_ERROR", "The request was invalid.", 400, {
      fields: result.error.issues.map((issue) => issue.path.join(".")),
    });
  return result.data;
}

export async function buildApp(env: GameApiEnv) {
  const database = createDatabase(env.DATABASE_URL);
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "test" ? "silent" : "info",
      redact: [
        "req.headers.cookie",
        "req.headers.authorization",
        "req.headers.x-csrf-token",
        "res.headers.set-cookie",
        "password",
        "token",
      ],
    },
    bodyLimit: 32 * 1024,
    genReqId: (request) =>
      String(request.headers["x-request-id"] ?? crypto.randomUUID()),
  });
  app.decorate("db", database.db);
  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
  });
  await app.register(rateLimit, {
    global: true,
    max: 120,
    timeWindow: "1 minute",
  });
  let realtime: RealtimeRuntime;
  let stopScheduler: (() => void) | undefined;

  const context = { db: database.db, env };
  const mutationGuard = async (request: FastifyRequest, requireCsrf = true) => {
    if (!allowedOrigin(request.headers.origin, env))
      throw new DomainError(
        "ORIGIN_FORBIDDEN",
        "Request origin is not allowed.",
        403,
      );
    if (requireCsrf && !verifyCsrf(request, env))
      throw new DomainError("CSRF_INVALID", "CSRF validation failed.", 403);
  };

  app.setErrorHandler((error, request, reply) => {
    const domain = error instanceof DomainError ? error : undefined;
    const frameworkStatus = (error as Error & { statusCode?: number })
      .statusCode;
    const status =
      domain?.status ??
      (frameworkStatus && frameworkStatus >= 400 && frameworkStatus < 500
        ? frameworkStatus
        : 500);
    const code =
      domain?.code ??
      (status === 429
        ? "RATE_LIMITED"
        : status < 500
          ? "REQUEST_REJECTED"
          : "INTERNAL_ERROR");
    const message =
      domain?.message ??
      (status === 429
        ? "Too many requests. Try again later."
        : status < 500
          ? "The request was rejected."
          : "An unexpected error occurred.");
    if (status >= 500)
      request.log.error({ err: error, code }, "request failed");
    reply
      .status(status)
      .send(apiError(code, message, request.id, domain?.details));
  });
  app.setNotFoundHandler((request, reply) =>
    reply
      .status(404)
      .send(apiError("NOT_FOUND", "Route not found.", request.id)),
  );

  app.get("/api/health/live", async () => ({ status: "ok" }));
  app.get("/api/health/ready", async () => {
    await app.db.execute(sql`select 1`);
    return { status: "ready" };
  });
  app.get("/api/setup/status", async () => {
    const setup = await getHouseholdSetup(context);
    return { required: !setup.completed };
  });

  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      await mutationGuard(request, false);
      const body = parse(LoginSchema, request.body);
      const session = await login(context, body.email, body.password);
      reply.setCookie(
        COOKIE.host,
        session.token,
        cookieOptions(env, true, 7 * 24 * 60 * 60),
      );
      const csrfToken = issueCsrf(reply, env);
      return {
        authenticated: true,
        admin: session.admin,
        csrfToken,
        expiresAt: session.expiresAt.toISOString(),
      };
    },
  );
  app.post("/api/auth/logout", async (request, reply) => {
    await mutationGuard(request);
    await logout(context, request.cookies[COOKIE.host]);
    reply
      .clearCookie(COOKIE.host, { path: "/" })
      .clearCookie(COOKIE.csrf, { path: "/" });
    return { authenticated: false };
  });
  app.get("/api/auth/session", async (request, reply) => {
    const admin = await resolveAdmin(context, request.cookies[COOKIE.host]);
    if (!admin) return { authenticated: false };
    const csrfToken = issueCsrf(reply, env);
    return {
      authenticated: true,
      admin: { id: admin.adminId, email: admin.email },
      csrfToken,
    };
  });
  app.get("/api/admin/setup", async (request) => {
    const admin = await resolveAdmin(context, request.cookies[COOKIE.host]);
    if (!admin)
      throw new DomainError("AUTH_REQUIRED", "Host sign-in is required.", 401);
    return getHouseholdSetup(context);
  });
  app.patch("/api/admin/setup", async (request) => {
    await mutationGuard(request);
    const admin = await resolveAdmin(context, request.cookies[COOKIE.host]);
    if (!admin)
      throw new DomainError("AUTH_REQUIRED", "Host sign-in is required.", 401);
    return saveHouseholdSetup(
      context,
      admin.adminId,
      parse(SetupSchema, request.body),
    );
  });
  app.delete("/api/admin/history", async (request) => {
    await mutationGuard(request);
    const admin = await resolveAdmin(context, request.cookies[COOKIE.host]);
    if (!admin) throw new DomainError("AUTH_REQUIRED", "Administrator sign-in is required.", 401);
    const setup = await getHouseholdSetup(context);
    const removed = await clearHouseholdHistory(app.db, setup.id);
    await app.db.insert(auditEvents).values({ householdId: setup.id, actorType: "ADMIN", actorId: admin.adminId, eventType: "HOUSEHOLD_HISTORY_CLEARED", metadata: { recordsRemoved: removed.length } });
    return { cleared: true, recordsRemoved: removed.length };
  });
  app.get("/api/admin/integrations/status", async (request) => {
    const admin = await resolveAdmin(context, request.cookies[COOKIE.host]);
    if (!admin)
      throw new DomainError("AUTH_REQUIRED", "Host sign-in is required.", 401);
    try {
      const response = await fetch(
        new URL("/internal/setup/status", env.INTEGRATION_SERVICE_INTERNAL_URL),
        {
          headers: {
            "x-integration-secret": env.INTEGRATION_SERVICE_SHARED_SECRET,
          },
          signal: AbortSignal.timeout(3000),
        },
      );
      if (!response.ok)
        throw new Error(`integration status ${response.status}`);
      return await response.json();
    } catch {
      return { unavailable: true, providers: {} };
    }
  });
  app.get("/api/admin/rooms/:roomId/recommendation-debug", async (request) => {
    const admin = await resolveAdmin(context, request.cookies[COOKIE.host]);
    if (!admin)
      throw new DomainError(
        "AUTH_REQUIRED",
        "Administrator sign-in is required.",
        401,
      );
    const { roomId } = parse(ParamsRoomSchema, request.params);
    return { roomId, candidates: await getRecommendationDebug(app.db, roomId) };
  });

  app.post(
    "/api/rooms",
    { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } },
    async (request, reply) => {
      await mutationGuard(request, false);
      const body = parse(CreateRoomSchema, request.body);
      const idempotencyKey = request.headers["idempotency-key"];
      if (
        typeof idempotencyKey !== "string" ||
        !z.uuid().safeParse(idempotencyKey).success
      )
        throw new DomainError(
          "IDEMPOTENCY_KEY_REQUIRED",
          "A valid UUID Idempotency-Key header is required.",
          400,
        );
      const creatorIdentifier = hashToken(
        `room-create:${idempotencyKey}`,
        env.PARTICIPANT_SESSION_PEPPER,
      );
      const created = await createRoom(
        context,
        creatorIdentifier,
        body,
        idempotencyKey,
      );
      if (!created.replayed && "token" in created)
        reply.setCookie(COOKIE.participant, created.token, cookieOptions(env));
      const [room] = await app.db
        .select()
        .from(rooms)
        .where(eq(rooms.id, created.roomId))
        .limit(1);
      if (!room)
        throw new DomainError("ROOM_NOT_FOUND", "Room not found.", 404);
      if (created.replayed) {
        const current = await resolveParticipant(
          context,
          request.cookies[COOKIE.participant],
        );
        if (current?.roomId !== room.id && room.hostParticipantId) {
          const replacementToken = generateSessionToken();
          await app.db
            .update(participants)
            .set({
              tokenHash: hashToken(
                replacementToken,
                env.PARTICIPANT_SESSION_PEPPER,
              ),
              lastSeenAt: new Date(),
            })
            .where(eq(participants.id, room.hostParticipantId));
          reply.setCookie(
            COOKIE.participant,
            replacementToken,
            cookieOptions(env),
          );
        }
      }
      issueCsrf(reply, env);
      reply.status(created.replayed ? 200 : 201);
      return {
        roomId: room.id,
        name: room.name,
        code: room.code,
        state: room.state,
        replayed: created.replayed,
      };
    },
  );
  app.post(
    "/api/rooms/join",
    { config: { rateLimit: { max: 15, timeWindow: "1 minute" } } },
    async (request, reply) => {
      await mutationGuard(request, false);
      const joined = await joinRoom(
        context,
        parse(JoinRoomSchema, request.body),
        request.cookies[COOKIE.participant],
      );
      if (joined.token)
        reply.setCookie(COOKIE.participant, joined.token, cookieOptions(env));
      issueCsrf(reply, env);
      await realtime.broadcastRoom(
        joined.room.id,
        joined.restored
          ? "room:participant-reconnected"
          : "room:participant-joined",
      );
      return {
        roomId: joined.room.id,
        code: joined.room.code,
        participant: {
          id: joined.participant.id,
          nickname: joined.participant.displayNickname,
          role: joined.participant.role,
        },
        restored: joined.restored,
      };
    },
  );
  app.get(
    "/api/rooms/:roomId/snapshot",
    {
      config: {
        rateLimit: {
          max: 600,
          timeWindow: "1 minute",
          groupId: "room-snapshots",
        },
      },
    },
    async (request) => {
      const { roomId } = parse(ParamsRoomSchema, request.params);
      const participant = await resolveParticipant(
        context,
        request.cookies[COOKIE.participant],
      );
      if (participant?.roomId === roomId)
        return getSnapshot(
          app.db,
          roomId,
          participant.role === "HOST" ? "HOST" : "PARTICIPANT",
          realtime.presence,
          participant.id,
        );
      const display = await resolveDisplay(
        context,
        request.cookies[COOKIE.display],
      );
      if (display?.roomId === roomId)
        return getSnapshot(app.db, roomId, "DISPLAY", realtime.presence);
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "A room-scoped session is required.",
        401,
      );
    },
  );
  app.post("/api/rooms/:roomId/lock", async (request) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "HOST_REQUIRED",
        "Room host authorization is required.",
        403,
      );
    const room = await setRoomLock(app.db, participant.id, roomId, true);
    await realtime.broadcastRoom(roomId, "room:locked");
    return { roomId, locked: true, sequence: room.version };
  });
  app.post("/api/rooms/:roomId/unlock", async (request) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "HOST_REQUIRED",
        "Room host authorization is required.",
        403,
      );
    const room = await setRoomLock(app.db, participant.id, roomId, false);
    await realtime.broadcastRoom(roomId, "room:unlocked");
    return { roomId, locked: false, sequence: room.version };
  });
  app.get("/api/catalog/search", async (request) => {
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "Join a room before searching the catalog.",
        401,
      );
    const query = parse(CatalogQuerySchema, request.query);
    return searchCatalog(
      context,
      participant.roomId,
      query.q,
      query.mediaType,
      query.autocomplete,
    );
  });
  app.get("/api/plex/status", async (request) => {
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "Join a room before connecting Plex.",
        401,
      );
    return getPlexAuthStatus(context, participant.id);
  });
  app.post("/api/plex/auth/start", async (request) => {
    await mutationGuard(request);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "Join a room before connecting Plex.",
        401,
      );
    const forwardUrl = new URL(
      `/room/${participant.roomId}?plex=return`,
      env.PUBLIC_APP_URL,
    ).toString();
    return startPlexAuth(context, participant.id, forwardUrl);
  });
  app.get("/api/catalog/plex-watchlist", async (request) => {
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "Join a room before loading a Plex watchlist.",
        401,
      );
    return plexWatchlistSuggestions(
      context,
      participant.roomId,
      participant.id,
    );
  });
  app.delete("/api/plex/auth", async (request) => {
    await mutationGuard(request);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "Join a room before disconnecting Plex.",
        401,
      );
    return unlinkPlex(context, participant.id);
  });
  app.post("/api/rooms/:roomId/nominations/start", async (request) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "HOST_REQUIRED",
        "Room host authorization is required.",
        403,
      );
    const { rules } = parse(StartNominationsSchema, request.body);
    const result = await startNominations(
      context,
      participant.id,
      roomId,
      rules,
    );
    await realtime.broadcastRoom(roomId, "room:nominations-started");
    return {
      state: result.room.state,
      deadline: result.deadline.toISOString(),
    };
  });
  app.post("/api/rooms/:roomId/nominations/extend", async (request) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const { seconds } = parse(ExtendNominationsSchema, request.body);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "HOST_REQUIRED",
        "Room host authorization is required.",
        403,
      );
    const deadline = await extendNominations(
      context,
      participant.id,
      roomId,
      seconds,
    );
    await realtime.broadcastRoom(roomId, "room:nomination-progress");
    return { deadline: deadline.toISOString() };
  });
  app.post("/api/rooms/:roomId/nominations/close", async (request) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "HOST_REQUIRED",
        "Room host authorization is required.",
        403,
      );
    await closeNominations(context, participant.id, roomId);
    await realtime.broadcastRoom(roomId, "room:nominations-revealed");
    return { state: "NOMINATIONS_LOCKED" };
  });
  app.put("/api/rooms/:roomId/submissions/:rank", async (request) => {
    await mutationGuard(request);
    const { roomId, rank } = parse(ParamsSubmissionSchema, request.params);
    const { catalogKey } = parse(SubmitNominationSchema, request.body);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant?.roomId || participant.roomId !== roomId)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "A room-scoped session is required.",
        401,
      );
    await submitNomination(
      context,
      participant.id,
      roomId,
      rank as 1 | 2,
      catalogKey,
    );
    await realtime.broadcastRoom(roomId, "room:nomination-progress");
    return { saved: true, rank };
  });
  app.post("/api/rooms/:roomId/submissions/lock", async (request) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant || participant.roomId !== roomId)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "A room-scoped session is required.",
        401,
      );
    await setNominationsReady(context, participant.id, roomId, true);
    await realtime.broadcastRoom(roomId, "room:nomination-progress");
    return { ready: true };
  });
  app.post("/api/rooms/:roomId/submissions/unlock", async (request) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant || participant.roomId !== roomId)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "A room-scoped session is required.",
        401,
      );
    await setNominationsReady(context, participant.id, roomId, false);
    await realtime.broadcastRoom(roomId, "room:nomination-progress");
    return { ready: false };
  });
  app.post("/api/rooms/:roomId/tournament/start", async (request) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "HOST_REQUIRED",
        "Room host authorization is required.",
        403,
      );
    const result = await startTournament(
      context,
      participant.id,
      roomId,
      parse(StartTournamentSchema, request.body),
    );
    await realtime.broadcastRoom(roomId, "bracket:updated");
    return {
      started: true,
      format: result.engine.format,
      totalMatchups:
        result.engine.format === 8 ? 9 : result.engine.format === 12 ? 15 : 19,
    };
  });
  app.post("/api/matchups/:matchupId/vote", async (request) => {
    await mutationGuard(request);
    const { matchupId } = parse(ParamsMatchupSchema, request.params);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "ROOM_SESSION_REQUIRED",
        "A room-scoped session is required.",
        401,
      );
    const result = await submitVote(
      context,
      participant.id,
      matchupId,
      parse(VoteSchema, request.body),
    );
    const transition = result.allVotesReceived
      ? await processTournamentTransition(context, result.roomId)
      : undefined;
    await realtime.broadcastRoom(
      result.roomId,
      transition?.changed && transition.event
        ? transition.event
        : "matchup:vote-accepted",
    );
    return result;
  });
  app.post("/api/rooms/:roomId/tournament/extend", async (request) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const { seconds } = parse(ExtendNominationsSchema, request.body);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "HOST_REQUIRED",
        "Room host authorization is required.",
        403,
      );
    const deadline = await extendVoting(
      context,
      participant.id,
      roomId,
      seconds,
    );
    await realtime.broadcastRoom(roomId, "matchup:started");
    return { deadline: deadline.toISOString() };
  });
  app.post(
    "/api/rooms/:roomId/tournament/skip-presentation",
    async (request) => {
      await mutationGuard(request);
      const { roomId } = parse(ParamsRoomSchema, request.params);
      const participant = await resolveParticipant(
        context,
        request.cookies[COOKIE.participant],
      );
      if (!participant)
        throw new DomainError(
          "HOST_REQUIRED",
          "Room host authorization is required.",
          403,
        );
      await skipPresentation(context, participant.id, roomId);
      await realtime.broadcastRoom(roomId, "bracket:updated");
      return { skipped: true };
    },
  );
  app.post(
    "/api/rooms/:roomId/winner/request",
    { config: { rateLimit: { max: 3, timeWindow: "1 hour" } } },
    async (request) => {
      await mutationGuard(request);
      const { roomId } = parse(ParamsRoomSchema, request.params);
      const input = parse(WinnerRequestSchema, request.body);
      const participant = await resolveParticipant(
        context,
        request.cookies[COOKIE.participant],
      );
      if (
        !participant ||
        participant.roomId !== roomId ||
        participant.role !== "HOST"
      )
        throw new DomainError(
          "HOST_REQUIRED",
          "Only the room host can request the winning title.",
          403,
        );
      const [winner] = await app.db
        .select({
          householdId: rooms.householdId,
          state: rooms.state,
          mediaType: mediaItems.mediaType,
          tmdbId: mediaItems.tmdbId,
          title: mediaItems.title,
        })
        .from(rooms)
        .innerJoin(tournaments, eq(tournaments.roomId, rooms.id))
        .innerJoin(
          candidates,
          eq(candidates.id, tournaments.championCandidateId),
        )
        .innerJoin(mediaItems, eq(mediaItems.id, candidates.mediaItemId))
        .where(eq(rooms.id, roomId))
        .limit(1);
      if (!winner || winner.state !== "WINNER" || !winner.tmdbId)
        throw new DomainError(
          "WINNER_NOT_REQUESTABLE",
          "A canonical winning title is required before requesting media.",
          409,
        );
      if (winner.mediaType === "TV" && !input.tvSeasonPolicy)
        throw new DomainError(
          "TV_SEASON_POLICY_REQUIRED",
          "Choose which TV seasons to request.",
          400,
        );
      const result = await requestFromSeerr(context, {
        tmdbId: winner.tmdbId,
        mediaType: winner.mediaType,
        ...(input.tvSeasonPolicy
          ? { tvSeasonPolicy: input.tvSeasonPolicy }
          : {}),
      });
      await app.db
        .insert(auditEvents)
        .values({
          householdId: winner.householdId,
          roomId,
          actorType: "PARTICIPANT",
          actorId: participant.id,
          eventType: "WINNER_MEDIA_REQUESTED",
          metadata: {
            mediaType: winner.mediaType,
            title: winner.title,
            requestId: result.requestId,
            tvSeasonPolicy: input.tvSeasonPolicy ?? null,
          },
        });
      return {
        requested: true,
        requestId: result.requestId,
        status: result.status,
      };
    },
  );
  app.post("/api/rooms/:roomId/run-it-back", async (request, reply) => {
    await mutationGuard(request);
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(context, request.cookies[COOKIE.participant]);
    if (!participant) throw new DomainError("HOST_REQUIRED", "Room host authorization is required.", 403);
    const replay = await runItBack(context, participant.id, roomId);
    reply.setCookie(COOKIE.participant, replay.token, cookieOptions(env));
    issueCsrf(reply, env);
    await realtime.broadcastRoom(roomId, "room:winner");
    return { roomId: replay.roomId, code: replay.code, name: replay.name, participantCount: replay.participantCount };
  });
  app.post(
    "/api/rooms/:roomId/display-pairing-codes",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      await mutationGuard(request);
      const { roomId } = parse(ParamsRoomSchema, request.params);
      const participant = await resolveParticipant(
        context,
        request.cookies[COOKIE.participant],
      );
      if (!participant)
        throw new DomainError(
          "HOST_REQUIRED",
          "Room host authorization is required.",
          403,
        );
      const result = await createDisplayPairingCode(
        context,
        participant.id,
        roomId,
      );
      return {
        pairingCode: result.code,
        expiresAt: result.expiresAt.toISOString(),
      };
    },
  );
  app.post(
    "/api/rooms/:roomId/cast-launch-tokens",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request) => {
      await mutationGuard(request);
      const { roomId } = parse(ParamsRoomSchema, request.params);
      const participant = await resolveParticipant(
        context,
        request.cookies[COOKIE.participant],
      );
      if (!participant)
        throw new DomainError(
          "HOST_REQUIRED",
          "Room host authorization is required.",
          403,
        );
      const result = await createCastLaunchToken(
        context,
        participant.id,
        roomId,
      );
      return {
        launchToken: result.token,
        protocolVersion: result.protocolVersion,
        expiresAt: result.expiresAt.toISOString(),
      };
    },
  );
  app.post(
    "/api/displays/pair",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      await mutationGuard(request, false);
      const result = await pairDisplay(
        context,
        parse(PairDisplaySchema, request.body),
      );
      reply.setCookie(
        COOKIE.display,
        result.token,
        cookieOptions(env, true, 24 * 60 * 60),
      );
      issueCsrf(reply, env);
      await realtime.broadcastRoom(result.display.roomId, "display:paired");
      return {
        displaySessionId: result.display.id,
        roomId: result.display.roomId,
        expiresAt: result.display.expiresAt.toISOString(),
      };
    },
  );
  app.post(
    "/api/displays/cast/exchange",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request) => {
      await mutationGuard(request, false);
      const result = await exchangeCastLaunchToken(
        context,
        parse(CastExchangeSchema, request.body),
      );
      for (const displayId of result.replacedDisplaySessionIds)
        await realtime.revokeDisplaySocket(
          displayId,
          result.display.roomId,
          false,
          "REPLACED",
        );
      await realtime.broadcastRoom(result.display.roomId, "display:paired");
      return {
        displaySessionId: result.display.id,
        roomId: result.display.roomId,
        displayToken: result.token,
        expiresAt: result.display.expiresAt.toISOString(),
        protocolVersion: 1,
      };
    },
  );
  app.get(
    "/api/displays/:displaySessionId/snapshot",
    {
      config: {
        rateLimit: {
          max: 600,
          timeWindow: "1 minute",
          groupId: "display-snapshots",
        },
      },
    },
    async (request) => {
      const { displaySessionId } = parse(ParamsDisplaySchema, request.params);
      const authorization = request.headers.authorization;
      const bearer =
        typeof authorization === "string" &&
        authorization.startsWith("Bearer ")
          ? authorization.slice(7)
          : undefined;
      const display = await resolveDisplay(
        context,
        request.cookies[COOKIE.display] ?? bearer,
      );
      if (!display || display.id !== displaySessionId)
        throw new DomainError(
          "DISPLAY_SESSION_REQUIRED",
          "A valid display session is required.",
          401,
        );
      return getSnapshot(app.db, display.roomId, "DISPLAY", realtime.presence);
    },
  );
  app.delete("/api/displays/:displaySessionId", async (request) => {
    await mutationGuard(request);
    const { displaySessionId } = parse(ParamsDisplaySchema, request.params);
    const participant = await resolveParticipant(
      context,
      request.cookies[COOKIE.participant],
    );
    if (!participant)
      throw new DomainError(
        "HOST_REQUIRED",
        "Room host authorization is required.",
        403,
      );
    const display = await revokeDisplay(
      app.db,
      participant.id,
      displaySessionId,
    );
    await realtime.revokeDisplaySocket(display.id, display.roomId);
    await realtime.broadcastRoom(display.roomId, "display:revoked");
    return { revoked: true };
  });

  app.addHook("onReady", async () => {
    await app.db.execute(sql`select 1`);
    await bootstrapAdmin(context);
    await seedMockCatalog(context);
    realtime = createRealtime(app, env);
    stopScheduler = startExpirationScheduler(app.db, async (roomId) => {
      await processTournamentTransition(context, roomId);
      await realtime.broadcastRoom(roomId);
    });
  });
  app.addHook("onClose", async () => {
    stopScheduler?.();
    realtime?.close();
    await database.client.end();
  });
  return app;
}
