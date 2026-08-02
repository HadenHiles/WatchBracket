import { and, eq, gt, isNull } from 'drizzle-orm';
import type { Database } from '@watch-bracket/db';
import { displaySessions, participants, rooms } from '@watch-bracket/db';
import type { LobbyScene } from '@watch-bracket/display-protocol';
import type { RoomSnapshot } from '@watch-bracket/realtime-protocol';
import { DomainError } from './domain.js';

export type Presence = { participantIds: Set<string>; displayIds: Set<string> };
export async function getSnapshot(db: Database, roomId: string, viewer: RoomSnapshot['viewer'], presence: Presence): Promise<RoomSnapshot> {
  const [room] = await db.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  if (!room) throw new DomainError('ROOM_NOT_FOUND', 'Room not found.', 404);
  const people = await db.select().from(participants).where(and(eq(participants.roomId, roomId), isNull(participants.removedAt)));
  const displays = viewer === 'DISPLAY' ? [] : await db.select().from(displaySessions).where(and(eq(displaySessions.roomId, roomId), isNull(displaySessions.revokedAt), gt(displaySessions.expiresAt, new Date())));
  return {
    roomId: room.id, name: room.name, code: room.code, state: room.state, locked: Boolean(room.lockedAt), sequence: room.version, viewer,
    participants: people.map((person) => ({ ...(viewer === 'DISPLAY' ? {} : { id: person.id }), nickname: person.displayNickname, role: person.role === 'HOST' ? 'HOST' as const : 'PARTICIPANT' as const, connected: presence.participantIds.has(person.id) })),
    displays: displays.map((display) => ({ id: display.id, name: display.displayName, kind: display.kind, connected: presence.displayIds.has(display.id) }))
  };
}

export function toLobbyScene(snapshot: RoomSnapshot, publicAppUrl: string): LobbyScene {
  return { type: 'LOBBY', roomName: snapshot.name, roomCode: snapshot.code, joinUrl: `${publicAppUrl}/join/${snapshot.code}`, locked: snapshot.locked, participants: snapshot.participants.map(({ nickname, role, connected }) => ({ nickname, role, connected })) };
}
