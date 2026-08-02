import { z } from 'zod';

export const ParticipantDtoSchema = z.object({ id: z.uuid().optional(), nickname: z.string(), role: z.enum(['HOST', 'PARTICIPANT']), connected: z.boolean() });
export const DisplayDtoSchema = z.object({ id: z.uuid(), name: z.string(), kind: z.enum(['BROWSER', 'CAST']), connected: z.boolean() });
export const HouseRulesSchema = z.object({
  preset: z.enum(['QUICK_PICK', 'MOVIE_NIGHT', 'DEEP_DIVE']),
  nominationDurationSeconds: z.number().int().min(30).max(900),
  nominationSlots: z.literal(2),
  revealMode: z.literal('AFTER_DEADLINE')
});
export type HouseRules = z.infer<typeof HouseRulesSchema>;
export const CatalogItemSchema = z.object({ catalogKey: z.string(), mediaType: z.enum(['MOVIE', 'TV']), title: z.string(), releaseYear: z.number().int(), runtimeMinutes: z.number().int(), contentRating: z.string(), genres: z.array(z.string()), synopsis: z.string() });
export type CatalogItem = z.infer<typeof CatalogItemSchema>;
export const SubmissionDtoSchema = CatalogItemSchema.extend({ rank: z.number().int().min(1).max(2) });
export const CandidateDtoSchema = CatalogItemSchema.extend({ supportCount: z.number().int().positive(), bestRank: z.number().int().min(1).max(2) });
export const RoomSnapshotSchema = z.object({
  roomId: z.uuid(), name: z.string(), code: z.string(), state: z.enum(['LOBBY', 'NOMINATING', 'NOMINATIONS_LOCKED', 'EXPIRED']), locked: z.boolean(),
  sequence: z.number().int().nonnegative(), viewer: z.enum(['HOST', 'PARTICIPANT', 'DISPLAY']),
  viewerParticipantId: z.uuid().nullable(), viewerReady: z.boolean(), participants: z.array(ParticipantDtoSchema), displays: z.array(DisplayDtoSchema),
  rules: HouseRulesSchema, nominationDeadline: z.iso.datetime().nullable(), nominationsRevealed: z.boolean(),
  nominationProgress: z.object({ submittedParticipants: z.number().int().nonnegative(), lockedParticipants: z.number().int().nonnegative(), totalParticipants: z.number().int().nonnegative() }),
  ownSubmissions: z.array(SubmissionDtoSchema), candidates: z.array(CandidateDtoSchema)
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
export const ServerEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), eventId: z.uuid(), roomId: z.uuid(), sequence: z.number().int().nonnegative(), serverTimestamp: z.iso.datetime(), payload: z.unknown()
});
export const RoomSubscribeSchema = z.object({ roomId: z.uuid(), lastSequence: z.number().int().nonnegative().optional() });
export const ParticipantHeartbeatSchema = z.object({ roomId: z.uuid() });
export const DisplaySubscribeSchema = z.object({ roomId: z.uuid(), displaySessionId: z.uuid() });
export const controllerEvents = ['room:snapshot','room:participant-joined','room:participant-left','room:participant-reconnected','room:locked','room:unlocked','room:nominations-started','room:nomination-progress','room:nominations-revealed','display:paired','display:revoked','room:error'] as const;
