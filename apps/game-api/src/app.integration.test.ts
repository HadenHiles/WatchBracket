import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, adminUsers, castLaunchTokens, displayPairingCodes, participants, rooms } from '@watch-bracket/db';
import { bootstrapAdmin } from './domain.js';
import { buildApp } from './app.js';
import { startExpirationScheduler } from './scheduler.js';
import type { GameApiEnv } from './env.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

if (!databaseUrl) {
  describe('PostgreSQL integration test configuration', () => {
    it('requires a real migrated TEST_DATABASE_URL', () => { throw new Error('TEST_DATABASE_URL is required; no in-memory persistence substitute is permitted.'); });
  });
}

suite('Milestone 1 API against PostgreSQL', () => {
  const env: GameApiEnv = {
    NODE_ENV: 'test', DATABASE_URL: databaseUrl!, PUBLIC_APP_URL: 'http://localhost:3000', PUBLIC_ALIAS_URL: 'http://vote.localhost:3000', PORT: 3001,
    ADMIN_BOOTSTRAP_EMAIL: 'host@example.com', ADMIN_BOOTSTRAP_PASSWORD: 'correct-horse-battery-staple',
    HOST_SESSION_PEPPER: 'host-session-pepper-for-tests', PARTICIPANT_SESSION_PEPPER: 'participant-session-pepper-tests', DISPLAY_SESSION_PEPPER: 'display-session-pepper-tests', CSRF_SECRET: 'csrf-secret-value-for-tests',
    INTEGRATION_SERVICE_INTERNAL_URL: 'http://integration-service:3002', INTEGRATION_SERVICE_SHARED_SECRET: 'integration-shared-secret-tests',
    ROOM_CODE_LENGTH: 6, ROOM_MAX_PARTICIPANTS: 8, ROOM_TTL_HOURS: 12, DISPLAY_PAIRING_TTL_SECONDS: 300, CAST_LAUNCH_TOKEN_TTL_SECONDS: 60
  };
  const inspector = createDatabase(databaseUrl!, { max: 2 });
  let app: Awaited<ReturnType<typeof buildApp>>;
  const origin = { origin: 'http://localhost:3000' };
  const cookieValue = (response: { cookies: Array<{ name: string; value: string }> }, name: string) => response.cookies.find((cookie) => cookie.name === name)?.value ?? '';
  const cookieHeader = (cookies: Record<string,string>) => Object.entries(cookies).map(([name,value]) => `${name}=${value}`).join('; ');

  beforeAll(async () => {
    await inspector.client.unsafe('TRUNCATE TABLE audit_events, idempotency_keys, cast_launch_tokens, display_sessions, display_pairing_codes, participants, rooms, admin_sessions, admin_users, households RESTART IDENTITY CASCADE');
    app = await buildApp(env); await app.ready();
  });
  afterAll(async () => { await app?.close(); await inspector.client.end(); });

  it('completes bootstrap, authentication, rooms, locking, display pairing, revocation, and expiration recovery', async () => {
    const admins = await inspector.db.select().from(adminUsers);
    expect(admins).toHaveLength(1);
    const originalHash = admins[0]!.passwordHash;
    const rerun = await bootstrapAdmin({ db: inspector.db, env: { ...env, ADMIN_BOOTSTRAP_PASSWORD: 'a-different-safe-password', ADMIN_BOOTSTRAP_EMAIL: 'different@example.com' } });
    expect(rerun.created).toBe(false);
    expect((await inspector.db.select().from(adminUsers))[0]).toMatchObject({ email: 'host@example.com', passwordHash: originalHash });

    expect((await app.inject({ method: 'POST', url: '/api/auth/login', headers: origin, payload: { email: 'host@example.com', password: 'wrong-password' } })).statusCode).toBe(401);
    const login = await app.inject({ method: 'POST', url: '/api/auth/login', headers: origin, payload: { email: 'host@example.com', password: env.ADMIN_BOOTSTRAP_PASSWORD } });
    expect(login.statusCode).toBe(200);
    const csrf = login.json().csrfToken as string;
    const hostCookie = cookieValue(login, 'wb_host');
    const authCookies: Record<string,string> = { wb_host: hostCookie, wb_csrf: csrf };
    const mutationHeaders = { ...origin, cookie: cookieHeader(authCookies), 'x-csrf-token': csrf };

    const create = await app.inject({ method: 'POST', url: '/api/rooms', headers: { ...mutationHeaders, 'idempotency-key': 'room-create-test-0001' }, payload: { name: 'Integration Night', hostNickname: 'Haden' } });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    const participantCookie = cookieValue(create, 'wb_participant');
    const [room] = await inspector.db.select().from(rooms).where(eq(rooms.id, created.roomId));
    const people = await inspector.db.select().from(participants).where(eq(participants.roomId, created.roomId));
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ role: 'HOST', displayNickname: 'Haden' });
    expect(room!.hostParticipantId).toBe(people[0]!.id);

    const replay = await app.inject({ method: 'POST', url: '/api/rooms', headers: { ...mutationHeaders, cookie: cookieHeader({ ...authCookies, wb_participant: participantCookie }), 'idempotency-key': 'room-create-test-0001' }, payload: { name: 'Integration Night', hostNickname: 'Haden' } });
    expect(replay.statusCode).toBe(200); expect(replay.json()).toMatchObject({ roomId: created.roomId, replayed: true });
    expect(await inspector.db.select().from(rooms)).toHaveLength(1);

    const join = await app.inject({ method: 'POST', url: '/api/rooms/join', headers: origin, payload: { roomCode: created.code, nickname: 'Maya' } });
    expect(join.statusCode).toBe(200);
    const guestCsrf = cookieValue(join, 'wb_csrf'); const guestParticipant = cookieValue(join, 'wb_participant');
    const restore = await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { ...origin, cookie: `wb_participant=${guestParticipant}` }, payload: { roomCode: created.code, nickname: 'Maya' } });
    expect(restore.json()).toMatchObject({ restored: true });
    expect(await inspector.db.select().from(participants).where(eq(participants.roomId, created.roomId))).toHaveLength(2);
    const duplicate = await app.inject({ method: 'POST', url: '/api/rooms/join', headers: origin, payload: { roomCode: created.code, nickname: '  MAYA ' } });
    expect(duplicate.statusCode).toBe(409); expect(duplicate.json().code).toBe('NICKNAME_TAKEN');

    const hostRoomCookies = cookieHeader({ ...authCookies, wb_participant: participantCookie });
    const hostHeaders = { ...origin, cookie: hostRoomCookies, 'x-csrf-token': csrf };
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/lock`, headers: { ...origin, cookie: cookieHeader({ wb_participant: guestParticipant, wb_csrf: guestCsrf }), 'x-csrf-token': guestCsrf }, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/lock`, headers: hostHeaders, payload: {} })).json()).toMatchObject({ locked: true });
    expect((await app.inject({ method: 'POST', url: '/api/rooms/join', headers: origin, payload: { roomCode: created.code, nickname: 'Alex' } })).statusCode).toBe(423);
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/unlock`, headers: hostHeaders, payload: {} })).json()).toMatchObject({ locked: false });
    expect((await app.inject({ method: 'POST', url: '/api/rooms/join', headers: origin, payload: { roomCode: created.code, nickname: 'Alex' } })).statusCode).toBe(200);

    const expiredCode = await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/display-pairing-codes`, headers: hostHeaders, payload: {} });
    await inspector.db.update(displayPairingCodes).set({ expiresAt: new Date(0) }).where(eq(displayPairingCodes.codeHash, (await inspector.db.select().from(displayPairingCodes).orderBy(displayPairingCodes.createdAt).limit(1))[0]!.codeHash));
    expect((await app.inject({ method: 'POST', url: '/api/displays/pair', headers: origin, payload: { pairingCode: expiredCode.json().pairingCode, displayName: 'TV' } })).statusCode).toBe(410);

    const pairing = await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/display-pairing-codes`, headers: hostHeaders, payload: {} });
    const pair = await app.inject({ method: 'POST', url: '/api/displays/pair', headers: origin, payload: { pairingCode: pairing.json().pairingCode, displayName: 'Living room' } });
    expect(pair.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/displays/pair', headers: origin, payload: { pairingCode: pairing.json().pairingCode, displayName: 'Replay' } })).statusCode).toBe(409);
    const displayCookie = cookieValue(pair, 'wb_display'); const displayCsrf = cookieValue(pair, 'wb_csrf');
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/lock`, headers: { ...origin, cookie: cookieHeader({ wb_display: displayCookie, wb_csrf: displayCsrf }), 'x-csrf-token': displayCsrf }, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/displays/${pair.json().displaySessionId}`, headers: hostHeaders })).json()).toMatchObject({ revoked: true });
    expect((await app.inject({ method: 'GET', url: `/api/displays/${pair.json().displaySessionId}/snapshot`, headers: { cookie: `wb_display=${displayCookie}` } })).statusCode).toBe(401);

    const expiredLaunch = await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/cast-launch-tokens`, headers: hostHeaders, payload: {} });
    expect(expiredLaunch.statusCode).toBe(200);
    await inspector.db.update(castLaunchTokens).set({ expiresAt: new Date(0) }).where(eq(castLaunchTokens.tokenHash, (await inspector.db.select().from(castLaunchTokens).orderBy(castLaunchTokens.createdAt).limit(1))[0]!.tokenHash));
    expect((await app.inject({ method: 'POST', url: '/api/displays/cast/exchange', headers: origin, payload: { launchToken: expiredLaunch.json().launchToken, protocolVersion: 1 } })).statusCode).toBe(410);
    const launch = await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/cast-launch-tokens`, headers: hostHeaders, payload: {} });
    const castExchange = await app.inject({ method: 'POST', url: '/api/displays/cast/exchange', headers: origin, payload: { launchToken: launch.json().launchToken, protocolVersion: 1 } });
    expect(castExchange.statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/displays/cast/exchange', headers: origin, payload: { launchToken: launch.json().launchToken, protocolVersion: 1 } })).statusCode).toBe(409);
    const castSession = castExchange.json();
    const castSnapshot = await app.inject({ method: 'GET', url: `/api/displays/${castSession.displaySessionId}/snapshot`, headers: { authorization: `Bearer ${castSession.displayToken}` } });
    expect(castSnapshot.statusCode).toBe(200); expect(castSnapshot.json()).toMatchObject({ roomId: created.roomId, viewer: 'DISPLAY' });
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/lock`, headers: { ...origin, authorization: `Bearer ${castSession.displayToken}` }, payload: {} })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/api/displays/${castSession.displaySessionId}`, headers: hostHeaders })).json()).toMatchObject({ revoked: true });

    const revokedIssuerLaunch = await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/cast-launch-tokens`, headers: hostHeaders, payload: {} });
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: hostHeaders, payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/displays/cast/exchange', headers: origin, payload: { launchToken: revokedIssuerLaunch.json().launchToken, protocolVersion: 1 } })).statusCode).toBe(401);

    await inspector.db.update(rooms).set({ expiresAt: new Date(0) }).where(eq(rooms.id, created.roomId));
    const stop = startExpirationScheduler(inspector.db, () => undefined, 10);
    await new Promise((resolve) => setTimeout(resolve, 80)); stop();
    expect((await inspector.db.select().from(rooms).where(eq(rooms.id, created.roomId)))[0]!.state).toBe('EXPIRED');
  });
});
