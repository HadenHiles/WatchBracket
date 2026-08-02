import { z } from 'zod';

export const ParticipantDtoSchema = z.object({ id: z.uuid().optional(), nickname: z.string(), role: z.enum(['HOST', 'PARTICIPANT']), connected: z.boolean() });
export const DisplayDtoSchema = z.object({ id: z.uuid(), name: z.string(), kind: z.enum(['BROWSER', 'CAST']), connected: z.boolean() });
export const RoomSnapshotSchema = z.object({
  roomId: z.uuid(), name: z.string(), code: z.string(), state: z.enum(['LOBBY', 'EXPIRED']), locked: z.boolean(),
  sequence: z.number().int().nonnegative(), viewer: z.enum(['HOST', 'PARTICIPANT', 'DISPLAY']),
  participants: z.array(ParticipantDtoSchema), displays: z.array(DisplayDtoSchema)
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
export const ServerEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), eventId: z.uuid(), roomId: z.uuid(), sequence: z.number().int().nonnegative(), serverTimestamp: z.iso.datetime(), payload: z.unknown()
});
export const RoomSubscribeSchema = z.object({ roomId: z.uuid(), lastSequence: z.number().int().nonnegative().optional() });
export const ParticipantHeartbeatSchema = z.object({ roomId: z.uuid() });
export const DisplaySubscribeSchema = z.object({ roomId: z.uuid(), displaySessionId: z.uuid() });
export const controllerEvents = ['room:snapshot','room:participant-joined','room:participant-left','room:participant-reconnected','room:locked','room:unlocked','display:paired','display:revoked','room:error'] as const;
