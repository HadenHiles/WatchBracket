import { randomUUID } from 'node:crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { Server, type Socket } from 'socket.io';
import { displaySessions, participants } from '@watch-bracket/db';
import { DisplaySubscribeSchema, ParticipantHeartbeatSchema, RoomSubscribeSchema } from '@watch-bracket/realtime-protocol';
import { bumpRoomVersion } from './domain.js';
import type { GameApiEnv } from './env.js';
import { allowedRealtimeRequest, COOKIE } from './security.js';
import { getSnapshot, toDisplayScene, type Presence } from './snapshots.js';
import { hashToken } from '@watch-bracket/shared';
import { z } from 'zod';

type ParticipantActor = { kind: 'PARTICIPANT'; id: string; roomId: string; role: 'HOST' | 'PARTICIPANT' };
type DisplayActor = { kind: 'DISPLAY'; id: string; roomId: string };
type SocketActor = ParticipantActor | DisplayActor;

declare module 'socket.io' { interface SocketData { actor?: SocketActor; subscribed?: boolean } }

const parseCookies = (header = '') => Object.fromEntries(header.split(';').map((item) => item.trim().split('=').map(decodeURIComponent)).filter((parts) => parts.length === 2) as [string, string][]);
const SocketAuthSchema = z.object({ displayToken: z.string().min(32).max(256).optional() });
const envelope = (roomId: string, sequence: number, payload: unknown) => ({ schemaVersion: 1 as const, eventId: randomUUID(), roomId, sequence, serverTimestamp: new Date().toISOString(), payload });
const sceneEnvelope = (roomId: string, sequence: number, scene: unknown) => ({ schemaVersion: 1 as const, eventId: randomUUID(), roomId, sequence, serverTimestamp: new Date().toISOString(), scene });

export type RealtimeRuntime = ReturnType<typeof createRealtime>;
export function createRealtime(app: FastifyInstance, env: GameApiEnv) {
  const participantConnections = new Map<string, number>();
  const displayConnections = new Map<string, number>();
  const winnerDisplayModes = new Map<string, "PODIUM" | "BRACKET">();
  const presence: Presence = {
    participantIds: new Set(),
    displayIds: new Set()
  };
  const io = new Server(app.server, {
    path: '/socket.io', maxHttpBufferSize: 16 * 1024, transports: ['websocket', 'polling'],
    allowRequest: (request, callback) => callback(null, allowedRealtimeRequest(request.headers, env))
  });

  const addPresence = (map: Map<string, number>, set: Set<string>, id: string) => { map.set(id, (map.get(id) ?? 0) + 1); set.add(id); };
  const removePresence = (map: Map<string, number>, set: Set<string>, id: string) => { const count = (map.get(id) ?? 1) - 1; if (count <= 0) { map.delete(id); set.delete(id); return true; } map.set(id, count); return false; };

  async function authenticate(socket: Socket): Promise<SocketActor | undefined> {
    const cookies = parseCookies(socket.handshake.headers.cookie);
    const participantToken = cookies[COOKIE.participant];
    if (participantToken) {
      const [row] = await app.db.select().from(participants).where(and(eq(participants.tokenHash, hashToken(participantToken, env.PARTICIPANT_SESSION_PEPPER)), isNull(participants.removedAt))).limit(1);
      if (row) return { kind: 'PARTICIPANT', id: row.id, roomId: row.roomId, role: row.role === 'HOST' ? 'HOST' : 'PARTICIPANT' };
    }
    const displayToken = cookies[COOKIE.display];
    const auth = SocketAuthSchema.safeParse(socket.handshake.auth);
    const resolvedDisplayToken = displayToken ?? (auth.success ? auth.data.displayToken : undefined);
    if (resolvedDisplayToken) {
      const [row] = await app.db.select().from(displaySessions).where(and(eq(displaySessions.tokenHash, hashToken(resolvedDisplayToken, env.DISPLAY_SESSION_PEPPER)), isNull(displaySessions.revokedAt), gt(displaySessions.expiresAt, new Date()))).limit(1);
      if (row) return { kind: 'DISPLAY', id: row.id, roomId: row.roomId };
    }
    return undefined;
  }

  io.use(async (socket, next) => {
    try { const actor = await authenticate(socket); if (!actor) return next(new Error('UNAUTHORIZED')); socket.data.actor = actor; next(); }
    catch { next(new Error('UNAUTHORIZED')); }
  });

  async function emitToControllers(roomId: string, eventName: string) {
    const sockets = await io.in(`controllers:${roomId}`).fetchSockets();
    for (const socket of sockets) {
      const actor = socket.data.actor;
      if (actor?.kind !== 'PARTICIPANT') continue;
      const snapshot = await getSnapshot(app.db, roomId, actor.role, presence, actor.id);
      socket.emit(eventName, envelope(roomId, snapshot.sequence, snapshot));
    }
  }
  async function emitToDisplays(roomId: string, eventName = 'display:scene') {
    const sockets = await io.in(`displays:${roomId}`).fetchSockets();
    for (const socket of sockets) {
      const actor = socket.data.actor;
      if (actor?.kind !== 'DISPLAY') continue;
      const snapshot = await getSnapshot(app.db, roomId, 'DISPLAY', presence);
      if (eventName === 'display:snapshot' || snapshot.state === 'EXPIRED') socket.emit('display:snapshot', envelope(roomId, snapshot.sequence, snapshot));
      else socket.emit(eventName, sceneEnvelope(roomId, snapshot.sequence, toDisplayScene(snapshot, env.PUBLIC_ALIAS_URL, winnerDisplayModes.get(roomId) ?? "AUTO")));
    }
  }
  async function broadcastRoom(roomId: string, controllerEvent = 'room:snapshot') {
    await Promise.all([emitToControllers(roomId, controllerEvent), emitToDisplays(roomId)]);
  }
  async function setWinnerDisplayMode(roomId: string, mode: "PODIUM" | "BRACKET") {
    winnerDisplayModes.set(roomId, mode);
    await emitToDisplays(roomId);
  }
  async function revokeDisplaySocket(displayId: string, roomId: string, bump = true, reason = 'REVOKED') {
    const sockets = await io.in(`display-session:${displayId}`).fetchSockets();
    const sequence = bump ? await bumpRoomVersion(app.db, roomId) ?? 0 : (await getSnapshot(app.db, roomId, 'DISPLAY', presence)).sequence;
    for (const socket of sockets) { socket.emit('display:revoked', envelope(roomId, sequence, { reason })); socket.disconnect(true); }
  }

  io.on('connection', (socket) => {
    socket.on('room:subscribe', async (input, callback) => {
      const parsed = RoomSubscribeSchema.safeParse(input);
      const actor = socket.data.actor;
      if (!parsed.success || actor?.kind !== 'PARTICIPANT' || actor.roomId !== parsed.data.roomId) return callback?.({ ok: false, code: 'FORBIDDEN' });
      if (socket.data.subscribed) { await emitToControllers(actor.roomId, 'room:snapshot'); return callback?.({ ok: true }); }
      await socket.join(`controllers:${actor.roomId}`);
      socket.data.subscribed = true;
      addPresence(participantConnections, presence.participantIds, actor.id);
      await app.db.update(participants).set({ lastSeenAt: new Date() }).where(eq(participants.id, actor.id));
      await bumpRoomVersion(app.db, actor.roomId);
      await broadcastRoom(actor.roomId, 'room:participant-reconnected');
      callback?.({ ok: true });
    });
    socket.on('participant:heartbeat', async (input, callback) => {
      const parsed = ParticipantHeartbeatSchema.safeParse(input);
      const actor = socket.data.actor;
      if (!parsed.success || actor?.kind !== 'PARTICIPANT' || actor.roomId !== parsed.data.roomId) return callback?.({ ok: false, code: 'FORBIDDEN' });
      await app.db.update(participants).set({ lastSeenAt: new Date() }).where(eq(participants.id, actor.id));
      callback?.({ ok: true });
    });
    socket.on('display:subscribe', async (input, callback) => {
      const parsed = DisplaySubscribeSchema.safeParse(input);
      const actor = socket.data.actor;
      if (!parsed.success || actor?.kind !== 'DISPLAY' || actor.roomId !== parsed.data.roomId || actor.id !== parsed.data.displaySessionId) return callback?.({ ok: false, code: 'FORBIDDEN' });
      if (socket.data.subscribed) { await emitToDisplays(actor.roomId, 'display:snapshot'); return callback?.({ ok: true }); }
      await Promise.all([socket.join(`displays:${actor.roomId}`), socket.join(`display-session:${actor.id}`)]);
      socket.data.subscribed = true;
      addPresence(displayConnections, presence.displayIds, actor.id);
      await app.db.update(displaySessions).set({ lastSeenAt: new Date() }).where(eq(displaySessions.id, actor.id));
      await bumpRoomVersion(app.db, actor.roomId);
      await emitToDisplays(actor.roomId, 'display:snapshot');
      await emitToControllers(actor.roomId, 'display:paired');
      callback?.({ ok: true });
    });
    socket.on('disconnect', async () => {
      const actor = socket.data.actor;
      if (!actor || !socket.data.subscribed) return;
      if (actor.kind === 'PARTICIPANT' && removePresence(participantConnections, presence.participantIds, actor.id)) {
        await bumpRoomVersion(app.db, actor.roomId); await broadcastRoom(actor.roomId, 'room:participant-left');
      }
      if (actor.kind === 'DISPLAY' && removePresence(displayConnections, presence.displayIds, actor.id)) {
        await bumpRoomVersion(app.db, actor.roomId); await emitToControllers(actor.roomId, 'room:snapshot');
      }
    });
  });

  return { io, presence, broadcastRoom, setWinnerDisplayMode, revokeDisplaySocket, close: () => io.close() };
}
