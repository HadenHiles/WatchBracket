import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { eq, sql } from 'drizzle-orm';
import Fastify, { type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { createDatabase, participants, rooms } from '@watch-bracket/db';
import { apiError, generateSessionToken, hashToken } from '@watch-bracket/shared';
import { bootstrapAdmin, createCastLaunchToken, createDisplayPairingCode, createRoom, DomainError, exchangeCastLaunchToken, joinRoom, login, logout, pairDisplay, resolveAdmin, resolveDisplay, resolveParticipant, revokeDisplay, setRoomLock } from './domain.js';
import type { GameApiEnv } from './env.js';
import { createRealtime, type RealtimeRuntime } from './realtime.js';
import { COOKIE, allowedOrigin, cookieOptions, issueCsrf, verifyCsrf } from './security.js';
import { getSnapshot } from './snapshots.js';
import { startExpirationScheduler } from './scheduler.js';

const LoginSchema = z.object({ email: z.email(), password: z.string().min(1).max(256) });
const CreateRoomSchema = z.object({ name: z.string().trim().min(1).max(80), hostNickname: z.string().min(1).max(64) });
const JoinRoomSchema = z.object({ roomCode: z.string().min(4).max(10), nickname: z.string().min(1).max(64) });
const PairDisplaySchema = z.object({ pairingCode: z.string().min(4).max(10), displayName: z.string().trim().min(1).max(64).default('Shared display') });
const CastExchangeSchema = z.object({ launchToken: z.string().min(32).max(256), protocolVersion: z.literal(1) });
const ParamsRoomSchema = z.object({ roomId: z.uuid() });
const ParamsDisplaySchema = z.object({ displaySessionId: z.uuid() });

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new DomainError('VALIDATION_ERROR', 'The request was invalid.', 400, { fields: result.error.issues.map((issue) => issue.path.join('.')) });
  return result.data;
}

export async function buildApp(env: GameApiEnv) {
  const database = createDatabase(env.DATABASE_URL);
  const app = Fastify({
    logger: { level: env.NODE_ENV === 'test' ? 'silent' : 'info', redact: ['req.headers.cookie', 'req.headers.authorization', 'req.headers.x-csrf-token', 'res.headers.set-cookie', 'password', 'token'] },
    bodyLimit: 32 * 1024, genReqId: (request) => String(request.headers['x-request-id'] ?? crypto.randomUUID())
  });
  app.decorate('db', database.db);
  await app.register(cookie);
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { global: false, max: 60, timeWindow: '1 minute' });
  let realtime: RealtimeRuntime;
  let stopScheduler: (() => void) | undefined;

  const context = { db: database.db, env };
  const mutationGuard = async (request: FastifyRequest, requireCsrf = true) => {
    if (!allowedOrigin(request.headers.origin, env)) throw new DomainError('ORIGIN_FORBIDDEN', 'Request origin is not allowed.', 403);
    if (requireCsrf && !verifyCsrf(request, env)) throw new DomainError('CSRF_INVALID', 'CSRF validation failed.', 403);
  };

  app.setErrorHandler((error, request, reply) => {
    const domain = error instanceof DomainError ? error : undefined;
    const frameworkStatus = (error as Error & { statusCode?: number }).statusCode;
    const status = domain?.status ?? (frameworkStatus && frameworkStatus >= 400 && frameworkStatus < 500 ? frameworkStatus : 500);
    const code = domain?.code ?? (status === 429 ? 'RATE_LIMITED' : status < 500 ? 'REQUEST_REJECTED' : 'INTERNAL_ERROR');
    const message = domain?.message ?? (status === 429 ? 'Too many requests. Try again later.' : status < 500 ? 'The request was rejected.' : 'An unexpected error occurred.');
    if (status >= 500) request.log.error({ err: error, code }, 'request failed');
    reply.status(status).send(apiError(code, message, request.id, domain?.details));
  });
  app.setNotFoundHandler((request, reply) => reply.status(404).send(apiError('NOT_FOUND', 'Route not found.', request.id)));

  app.get('/api/health/live', async () => ({ status: 'ok' }));
  app.get('/api/health/ready', async () => { await app.db.execute(sql`select 1`); return { status: 'ready' }; });

  app.post('/api/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    await mutationGuard(request, false);
    const body = parse(LoginSchema, request.body);
    const session = await login(context, body.email, body.password);
    reply.setCookie(COOKIE.host, session.token, cookieOptions(env, true, 7 * 24 * 60 * 60));
    const csrfToken = issueCsrf(reply, env);
    return { authenticated: true, admin: session.admin, csrfToken, expiresAt: session.expiresAt.toISOString() };
  });
  app.post('/api/auth/logout', async (request, reply) => {
    await mutationGuard(request);
    await logout(context, request.cookies[COOKIE.host]);
    reply.clearCookie(COOKIE.host, { path: '/' }).clearCookie(COOKIE.csrf, { path: '/' });
    return { authenticated: false };
  });
  app.get('/api/auth/session', async (request, reply) => {
    const admin = await resolveAdmin(context, request.cookies[COOKIE.host]);
    if (!admin) return { authenticated: false };
    const csrfToken = issueCsrf(reply, env);
    return { authenticated: true, admin: { id: admin.adminId, email: admin.email }, csrfToken };
  });

  app.post('/api/rooms', { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } }, async (request, reply) => {
    await mutationGuard(request);
    const admin = await resolveAdmin(context, request.cookies[COOKIE.host]);
    if (!admin) throw new DomainError('AUTH_REQUIRED', 'Host sign-in is required.', 401);
    const body = parse(CreateRoomSchema, request.body);
    const idempotencyKey = request.headers['idempotency-key'];
    if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 8 || idempotencyKey.length > 128) throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'A valid Idempotency-Key header is required.', 400);
    const created = await createRoom(context, admin.adminId, body, idempotencyKey);
    if (!created.replayed && 'token' in created) reply.setCookie(COOKIE.participant, created.token, cookieOptions(env));
    const [room] = await app.db.select().from(rooms).where(eq(rooms.id, created.roomId)).limit(1);
    if (!room) throw new DomainError('ROOM_NOT_FOUND', 'Room not found.', 404);
    if (created.replayed) {
      const current = await resolveParticipant(context, request.cookies[COOKIE.participant]);
      if (current?.roomId !== room.id && room.hostParticipantId) {
        const replacementToken = generateSessionToken();
        await app.db.update(participants).set({ tokenHash: hashToken(replacementToken, env.PARTICIPANT_SESSION_PEPPER), lastSeenAt: new Date() }).where(eq(participants.id, room.hostParticipantId));
        reply.setCookie(COOKIE.participant, replacementToken, cookieOptions(env));
      }
    }
    reply.status(created.replayed ? 200 : 201);
    return { roomId: room.id, name: room.name, code: room.code, state: room.state, replayed: created.replayed };
  });
  app.post('/api/rooms/join', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (request, reply) => {
    await mutationGuard(request, false);
    const joined = await joinRoom(context, parse(JoinRoomSchema, request.body), request.cookies[COOKIE.participant]);
    if (joined.token) reply.setCookie(COOKIE.participant, joined.token, cookieOptions(env));
    issueCsrf(reply, env);
    await realtime.broadcastRoom(joined.room.id, joined.restored ? 'room:participant-reconnected' : 'room:participant-joined');
    return { roomId: joined.room.id, code: joined.room.code, participant: { id: joined.participant.id, nickname: joined.participant.displayNickname, role: joined.participant.role }, restored: joined.restored };
  });
  app.get('/api/rooms/:roomId/snapshot', async (request) => {
    const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(context, request.cookies[COOKIE.participant]);
    if (participant?.roomId === roomId) return getSnapshot(app.db, roomId, participant.role === 'HOST' ? 'HOST' : 'PARTICIPANT', realtime.presence);
    const display = await resolveDisplay(context, request.cookies[COOKIE.display]);
    if (display?.roomId === roomId) return getSnapshot(app.db, roomId, 'DISPLAY', realtime.presence);
    throw new DomainError('ROOM_SESSION_REQUIRED', 'A room-scoped session is required.', 401);
  });
  app.post('/api/rooms/:roomId/lock', async (request) => {
    await mutationGuard(request); const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(context, request.cookies[COOKIE.participant]);
    if (!participant) throw new DomainError('HOST_REQUIRED', 'Room host authorization is required.', 403);
    const room = await setRoomLock(app.db, participant.id, roomId, true); await realtime.broadcastRoom(roomId, 'room:locked'); return { roomId, locked: true, sequence: room.version };
  });
  app.post('/api/rooms/:roomId/unlock', async (request) => {
    await mutationGuard(request); const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(context, request.cookies[COOKIE.participant]);
    if (!participant) throw new DomainError('HOST_REQUIRED', 'Room host authorization is required.', 403);
    const room = await setRoomLock(app.db, participant.id, roomId, false); await realtime.broadcastRoom(roomId, 'room:unlocked'); return { roomId, locked: false, sequence: room.version };
  });
  app.post('/api/rooms/:roomId/display-pairing-codes', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    await mutationGuard(request); const { roomId } = parse(ParamsRoomSchema, request.params);
    const participant = await resolveParticipant(context, request.cookies[COOKIE.participant]);
    if (!participant) throw new DomainError('HOST_REQUIRED', 'Room host authorization is required.', 403);
    const result = await createDisplayPairingCode(context, participant.id, roomId); return { pairingCode: result.code, expiresAt: result.expiresAt.toISOString() };
  });
  app.post('/api/rooms/:roomId/cast-launch-tokens', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request) => {
    await mutationGuard(request); const { roomId } = parse(ParamsRoomSchema, request.params);
    const [admin, participant] = await Promise.all([resolveAdmin(context, request.cookies[COOKIE.host]), resolveParticipant(context, request.cookies[COOKIE.participant])]);
    if (!admin || !participant) throw new DomainError('HOST_REQUIRED', 'Authenticated room host authorization is required.', 403);
    const result = await createCastLaunchToken(context, admin.sessionId, participant.id, roomId);
    return { launchToken: result.token, protocolVersion: result.protocolVersion, expiresAt: result.expiresAt.toISOString() };
  });
  app.post('/api/displays/pair', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (request, reply) => {
    await mutationGuard(request, false);
    const result = await pairDisplay(context, parse(PairDisplaySchema, request.body));
    reply.setCookie(COOKIE.display, result.token, cookieOptions(env, true, 24 * 60 * 60)); issueCsrf(reply, env);
    await realtime.broadcastRoom(result.display.roomId, 'display:paired');
    return { displaySessionId: result.display.id, roomId: result.display.roomId, expiresAt: result.display.expiresAt.toISOString() };
  });
  app.post('/api/displays/cast/exchange', { config: { rateLimit: { max: 10, timeWindow: '5 minutes' } } }, async (request) => {
    await mutationGuard(request, false);
    const result = await exchangeCastLaunchToken(context, parse(CastExchangeSchema, request.body));
    for (const displayId of result.replacedDisplaySessionIds) await realtime.revokeDisplaySocket(displayId, result.display.roomId, false, 'REPLACED');
    await realtime.broadcastRoom(result.display.roomId, 'display:paired');
    return { displaySessionId: result.display.id, roomId: result.display.roomId, displayToken: result.token, expiresAt: result.display.expiresAt.toISOString(), protocolVersion: 1 };
  });
  app.get('/api/displays/:displaySessionId/snapshot', async (request) => {
    const { displaySessionId } = parse(ParamsDisplaySchema, request.params);
    const authorization = request.headers.authorization;
    const bearer = typeof authorization === 'string' && authorization.startsWith('Bearer ') ? authorization.slice(7) : undefined;
    const display = await resolveDisplay(context, request.cookies[COOKIE.display] ?? bearer);
    if (!display || display.id !== displaySessionId) throw new DomainError('DISPLAY_SESSION_REQUIRED', 'A valid display session is required.', 401);
    return getSnapshot(app.db, display.roomId, 'DISPLAY', realtime.presence);
  });
  app.delete('/api/displays/:displaySessionId', async (request) => {
    await mutationGuard(request); const { displaySessionId } = parse(ParamsDisplaySchema, request.params);
    const participant = await resolveParticipant(context, request.cookies[COOKIE.participant]);
    if (!participant) throw new DomainError('HOST_REQUIRED', 'Room host authorization is required.', 403);
    const display = await revokeDisplay(app.db, participant.id, displaySessionId);
    await realtime.revokeDisplaySocket(display.id, display.roomId); await realtime.broadcastRoom(display.roomId, 'display:revoked'); return { revoked: true };
  });

  app.addHook('onReady', async () => {
    await app.db.execute(sql`select 1`);
    await bootstrapAdmin(context);
    realtime = createRealtime(app, env);
    stopScheduler = startExpirationScheduler(app.db, (roomId) => void realtime.broadcastRoom(roomId));
  });
  app.addHook('onClose', async () => { stopScheduler?.(); realtime?.close(); await database.client.end(); });
  return app;
}
