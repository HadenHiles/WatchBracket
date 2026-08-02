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
export const DisplayEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), eventId: z.uuid(), roomId: z.uuid(), sequence: z.number().int().nonnegative(), serverTimestamp: z.iso.datetime(), scene: LobbySceneSchema
});
export type DisplayEnvelope = z.infer<typeof DisplayEnvelopeSchema>;
