import { z } from 'zod';

export const CAST_NAMESPACE = 'urn:x-cast:live.famflix.watchbracket';
export const CastLaunchEnvelopeSchema = z.object({
  type: z.literal('WATCH_BRACKET_LAUNCH'),
  schemaVersion: z.literal(1),
  launchToken: z.string().min(32).max(256)
});
export type CastLaunchEnvelope = z.infer<typeof CastLaunchEnvelopeSchema>;

export const LobbySceneSchema = z.object({
  type: z.literal('LOBBY'), roomName: z.string(), roomCode: z.string(), joinUrl: z.url(), locked: z.boolean(),
  participants: z.array(z.object({ nickname: z.string(), role: z.enum(['HOST', 'PARTICIPANT']), connected: z.boolean() }))
});
export type LobbyScene = z.infer<typeof LobbySceneSchema>;
export const NominationProgressSceneSchema = z.object({
  type: z.literal('NOMINATION_PROGRESS'), roomName: z.string(), roomCode: z.string(), deadline: z.iso.datetime().nullable(),
  submittedParticipants: z.number().int().nonnegative(), lockedParticipants: z.number().int().nonnegative(), totalParticipants: z.number().int().nonnegative(),
  revealed: z.boolean(), candidates: z.array(z.object({ title: z.string(), mediaType: z.enum(['MOVIE', 'TV']), releaseYear: z.number().int(), supportCount: z.number().int().positive() }))
});
export type NominationProgressScene = z.infer<typeof NominationProgressSceneSchema>;
export const DisplaySceneSchema = z.discriminatedUnion('type', [LobbySceneSchema, NominationProgressSceneSchema]);
export type DisplayScene = z.infer<typeof DisplaySceneSchema>;
export const DisplayEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), eventId: z.uuid(), roomId: z.uuid(), sequence: z.number().int().nonnegative(), serverTimestamp: z.iso.datetime(), scene: DisplaySceneSchema
});
export type DisplayEnvelope = z.infer<typeof DisplayEnvelopeSchema>;
