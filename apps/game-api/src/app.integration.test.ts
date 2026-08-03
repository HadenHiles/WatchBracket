import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDatabase, adminUsers, castLaunchTokens, displayPairingCodes, matchups, participants, rooms, watchBracketHistory } from '@watch-bracket/db';
import { bootstrapAdmin } from './domain.js';
import { buildApp } from './app.js';
import { startExpirationScheduler } from './scheduler.js';
import type { GameApiEnv } from './env.js';
import { processTournamentTransition } from './tournament.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

if (!databaseUrl) {
  describe('PostgreSQL integration test configuration', () => {
    it('requires a real migrated TEST_DATABASE_URL', () => { throw new Error('TEST_DATABASE_URL is required; no in-memory persistence substitute is permitted.'); });
  });
}

suite('Milestones 1 through 3 API against PostgreSQL', () => {
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
    await inspector.client.unsafe('TRUNCATE TABLE audit_events, idempotency_keys, cast_launch_tokens, display_sessions, display_pairing_codes, votes, matchups, rounds, tournaments, candidates, submissions, media_items, participants, rooms, admin_sessions, admin_users, households RESTART IDENTITY CASCADE');
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

    expect((await app.inject({ method: 'GET', url: '/api/setup/status' })).json()).toEqual({ required: true });
    const setup = await app.inject({ method: 'PATCH', url: '/api/admin/setup', headers: mutationHeaders, payload: { name: 'Test Household', region: 'CA', timeZone: 'America/Toronto', defaultRules: { preset: 'QUICK_PICK', nominationDurationSeconds: 60, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' }, completed: true } });
    expect(setup.statusCode).toBe(200); expect(setup.json()).toMatchObject({ name: 'Test Household', completed: true });
    expect((await app.inject({ method: 'GET', url: '/api/setup/status' })).json()).toEqual({ required: false });

    const roomCreateKey = 'd9ed4dc6-cf03-45b5-90e9-92bd1d0d43e7';
    expect((await app.inject({ method: 'POST', url: '/api/rooms', headers: { origin: 'https://attacker.example', 'idempotency-key': roomCreateKey }, payload: { name: 'Integration Night', hostNickname: 'Haden' } })).statusCode).toBe(403);
    const create = await app.inject({ method: 'POST', url: '/api/rooms', headers: { ...origin, 'idempotency-key': roomCreateKey }, payload: { name: 'Integration Night', hostNickname: 'Haden' } });
    expect(create.statusCode).toBe(201);
    const created = create.json();
    const participantCookie = cookieValue(create, 'wb_participant');
    const roomCsrf = cookieValue(create, 'wb_csrf');
    expect(participantCookie).not.toBe(''); expect(roomCsrf).not.toBe('');
    const [room] = await inspector.db.select().from(rooms).where(eq(rooms.id, created.roomId));
    const people = await inspector.db.select().from(participants).where(eq(participants.roomId, created.roomId));
    expect(people).toHaveLength(1);
    expect(people[0]).toMatchObject({ role: 'HOST', displayNickname: 'Haden' });
    expect(room!.hostParticipantId).toBe(people[0]!.id);
    expect(room!.rules).toMatchObject({ preset: 'QUICK_PICK', nominationDurationSeconds: 60 });

    const replay = await app.inject({ method: 'POST', url: '/api/rooms', headers: { ...origin, cookie: cookieHeader({ wb_participant: participantCookie, wb_csrf: roomCsrf }), 'idempotency-key': roomCreateKey }, payload: { name: 'Integration Night', hostNickname: 'Haden' } });
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

    const hostRoomCookies = cookieHeader({ wb_participant: participantCookie, wb_csrf: roomCsrf });
    const hostHeaders = { ...origin, cookie: hostRoomCookies, 'x-csrf-token': roomCsrf };
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

    const catalog = await app.inject({ method: 'GET', url: '/api/catalog/search?q=science%20fiction', headers: { cookie: `wb_participant=${participantCookie}` } });
    expect(catalog.statusCode).toBe(200); expect(catalog.json().items).toHaveLength(4);
    const [firstTitle, secondTitle] = catalog.json().items;
    const rules = { preset: 'QUICK_PICK', nominationDurationSeconds: 30, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' };
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/nominations/start`, headers: hostHeaders, payload: { rules } })).statusCode).toBe(200);
    const guestHeaders = { ...origin, cookie: cookieHeader({ wb_participant: guestParticipant, wb_csrf: guestCsrf }), 'x-csrf-token': guestCsrf };
    for (const [headers, rank, catalogKey] of [[hostHeaders, 1, firstTitle.catalogKey], [hostHeaders, 2, secondTitle.catalogKey], [guestHeaders, 1, firstTitle.catalogKey], [guestHeaders, 2, secondTitle.catalogKey]] as const) {
      expect((await app.inject({ method: 'PUT', url: `/api/rooms/${created.roomId}/submissions/${rank}`, headers, payload: { catalogKey } })).statusCode).toBe(200);
    }
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/submissions/lock`, headers: hostHeaders, payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/submissions/lock`, headers: guestHeaders, payload: {} })).statusCode).toBe(200);
    const privateHostSnapshot = await app.inject({ method: 'GET', url: `/api/rooms/${created.roomId}/snapshot`, headers: { cookie: hostRoomCookies } });
    expect(privateHostSnapshot.json()).toMatchObject({ state: 'NOMINATING', nominationsRevealed: false, nominationProgress: { submittedParticipants: 2, lockedParticipants: 2 }, candidates: [] });
    expect(privateHostSnapshot.json().ownSubmissions).toHaveLength(2);
    const privateDisplaySnapshot = await app.inject({ method: 'GET', url: `/api/displays/${castSession.displaySessionId}/snapshot`, headers: { authorization: `Bearer ${castSession.displayToken}` } });
    expect(privateDisplaySnapshot.json()).toMatchObject({ state: 'NOMINATING', ownSubmissions: [], candidates: [] });
    await inspector.db.update(rooms).set({ nominationDeadline: new Date(0) }).where(eq(rooms.id, created.roomId));
    const stopNominationScheduler = startExpirationScheduler(inspector.db, () => undefined, 10);
    await new Promise((resolve) => setTimeout(resolve, 80)); stopNominationScheduler();
    const revealed = await app.inject({ method: 'GET', url: `/api/rooms/${created.roomId}/snapshot`, headers: { cookie: hostRoomCookies } });
    expect(revealed.json()).toMatchObject({ state: 'NOMINATIONS_LOCKED', nominationsRevealed: true });
    expect(revealed.json().candidates).toEqual(expect.arrayContaining([expect.objectContaining({ catalogKey: firstTitle.catalogKey, supportCount: 2 }), expect.objectContaining({ catalogKey: secondTitle.catalogKey, supportCount: 2 })]));
    const restoredInProgress = await app.inject({ method: 'POST', url: '/api/rooms/join', headers: { ...origin, cookie: `wb_participant=${guestParticipant}` }, payload: { roomCode: created.code, nickname: 'Maya' } });
    expect(restoredInProgress.json()).toMatchObject({ restored: true });

    const tournamentStart = await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/tournament/start`, headers: hostHeaders, payload: { format: 8, voteDurationSeconds: 10 } });
    expect(tournamentStart.statusCode).toBe(200); expect(tournamentStart.json()).toMatchObject({ format: 8, totalMatchups: 9 });
    for (let matchupNumber = 1; matchupNumber <= 9; matchupNumber++) {
      let tournamentSnapshot = (await app.inject({ method: 'GET', url: `/api/rooms/${created.roomId}/snapshot`, headers: { cookie: hostRoomCookies } })).json();
      expect(tournamentSnapshot.state).toBe('MATCHUP_INTRO'); expect(tournamentSnapshot.tournament.activeMatchup.sequence).toBe(matchupNumber);
      expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/tournament/skip-presentation`, headers: hostHeaders, payload: {} })).statusCode).toBe(200);
      tournamentSnapshot = (await app.inject({ method: 'GET', url: `/api/rooms/${created.roomId}/snapshot`, headers: { cookie: hostRoomCookies } })).json();
      expect(tournamentSnapshot.state).toBe('VOTING'); const active = tournamentSnapshot.tournament.activeMatchup;
      const firstVote = await app.inject({ method: 'POST', url: `/api/matchups/${active.id}/vote`, headers: hostHeaders, payload: { candidateId: active.candidateA.id, abstain: false } });
      expect(firstVote.statusCode).toBe(200); expect(firstVote.json()).toMatchObject({ allVotesReceived: false });
      expect((await app.inject({ method: 'POST', url: `/api/matchups/${active.id}/vote`, headers: hostHeaders, payload: { candidateId: active.candidateB.id, abstain: false } })).statusCode).toBe(200);
      const finalVote = await app.inject({ method: 'POST', url: `/api/matchups/${active.id}/vote`, headers: guestHeaders, payload: { abstain: true } });
      expect(finalVote.statusCode).toBe(200); expect(finalVote.json()).toMatchObject({ allVotesReceived: true });
      expect((await processTournamentTransition({ db: inspector.db, env }, created.roomId)).changed).toBe(false);
      const resultSnapshot = (await app.inject({ method: 'GET', url: `/api/displays/${castSession.displaySessionId}/snapshot`, headers: { authorization: `Bearer ${castSession.displayToken}` } })).json();
      expect(resultSnapshot).toMatchObject({ state: 'MATCHUP_RESULT', tournament: { activeMatchup: { sequence: matchupNumber, votesReceived: 2 } } });
      expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/tournament/skip-presentation`, headers: hostHeaders, payload: {} })).statusCode).toBe(200);
    }
    const winnerSnapshot = (await app.inject({ method: 'GET', url: `/api/rooms/${created.roomId}/snapshot`, headers: { cookie: hostRoomCookies } })).json();
    expect(winnerSnapshot).toMatchObject({ state: 'WINNER', tournament: { completedMatchups: 9, status: 'COMPLETED' } });
    expect(winnerSnapshot.tournament.champion).toBeTruthy();
    expect(winnerSnapshot.tournament.podium).toEqual([
      expect.objectContaining({ placement: 1 }),
      expect.objectContaining({ placement: 2 }),
      expect.objectContaining({ placement: 3 }),
    ]);
    expect(winnerSnapshot.tournament.tasteSnapshot).toMatchObject({ dominantGenres: expect.any(Array) });
    expect(winnerSnapshot.tournament.bracket[0]).toMatchObject({ winnerVotes: expect.any(Number), loserVotes: expect.any(Number), abstentions: expect.any(Number) });
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/winner/display-mode`, headers: guestHeaders, payload: { mode: 'BRACKET' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/winner/display-mode`, headers: hostHeaders, payload: { mode: 'BRACKET' } })).json()).toEqual({ mode: 'BRACKET' });
    expect(await inspector.db.select().from(watchBracketHistory).where(eq(watchBracketHistory.roomId, created.roomId))).toHaveLength(1);
    const replayRoom = await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/run-it-back`, headers: hostHeaders, payload: {} });
    expect(replayRoom.statusCode).toBe(200); expect(replayRoom.json()).toMatchObject({ participantCount: 3 });
    const replayParticipant = cookieValue(replayRoom, 'wb_participant');
    const replaySnapshot = await app.inject({ method: 'GET', url: `/api/rooms/${replayRoom.json().roomId}/snapshot`, headers: { cookie: `wb_participant=${replayParticipant}` } });
    expect(replaySnapshot.json()).toMatchObject({ state: 'LOBBY', viewer: 'HOST', participants: expect.arrayContaining([expect.objectContaining({ nickname: 'Maya' })]) });
    expect((await inspector.db.select().from(matchups).where(eq(matchups.roomId, created.roomId)))).toHaveLength(9);
    expect((await app.inject({ method: 'DELETE', url: `/api/displays/${castSession.displaySessionId}`, headers: hostHeaders })).json()).toMatchObject({ revoked: true });

    const adminIndependentLaunch = await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/cast-launch-tokens`, headers: hostHeaders, payload: {} });
    expect((await app.inject({ method: 'POST', url: '/api/auth/logout', headers: mutationHeaders, payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/api/displays/cast/exchange', headers: origin, payload: { launchToken: adminIndependentLaunch.json().launchToken, protocolVersion: 1 } })).statusCode).toBe(200);
    const removedHostLaunch = await app.inject({ method: 'POST', url: `/api/rooms/${created.roomId}/cast-launch-tokens`, headers: hostHeaders, payload: {} });
    await inspector.db.update(participants).set({ removedAt: new Date() }).where(eq(participants.id, room!.hostParticipantId!));
    expect((await app.inject({ method: 'POST', url: '/api/displays/cast/exchange', headers: origin, payload: { launchToken: removedHostLaunch.json().launchToken, protocolVersion: 1 } })).statusCode).toBe(401);

    await inspector.db.update(rooms).set({ expiresAt: new Date(0) }).where(eq(rooms.id, created.roomId));
    const stop = startExpirationScheduler(inspector.db, () => undefined, 10);
    await new Promise((resolve) => setTimeout(resolve, 80)); stop();
    expect((await inspector.db.select().from(rooms).where(eq(rooms.id, created.roomId)))[0]!.state).toBe('EXPIRED');
  }, 20_000);
});
