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
export const TournamentCandidateSchema = CatalogItemSchema.extend({ id: z.uuid(), seed: z.number().int().positive(), strikes: z.number().int().nonnegative(), redemption: z.boolean(), sourceType: z.enum(['DIRECT','MOCK_WILDCARD']), supportCount: z.number().int().nonnegative() });
export const TournamentStageSchema = z.enum(['QUALIFIER','SPOTLIGHT','REDEMPTION','REDEMPTION_FINAL','CHAMPIONSHIP_PLAY_IN','CHAMPIONSHIP_SEMI','CHAMPIONSHIP_FINAL']);
export const TournamentSnapshotSchema = z.object({
  format: z.union([z.literal(8),z.literal(12),z.literal(16)]), totalMatchups: z.number().int().positive(), completedMatchups: z.number().int().nonnegative(), stage: TournamentStageSchema, status: z.enum(['ACTIVE','COMPLETED']), champion: TournamentCandidateSchema.nullable(),
  activeMatchup: z.object({ id:z.uuid(),engineKey:z.string(),sequence:z.number().int().positive(),stage:TournamentStageSchema,status:z.enum(['INTRO','VOTING','RESOLVED']),candidateA:TournamentCandidateSchema,candidateB:TournamentCandidateSchema,deadline:z.iso.datetime().nullable(),votesReceived:z.number().int().nonnegative(),eligibleVoters:z.number().int().nonnegative(),ownVote:z.object({candidateId:z.uuid().nullable(),abstained:z.boolean()}).nullable(),resolution:z.object({winnerId:z.uuid(),loserId:z.uuid(),votesA:z.number().int().nonnegative(),votesB:z.number().int().nonnegative(),abstentions:z.number().int().nonnegative(),tieBreak:z.enum(['UNIQUE_NOMINATORS','FIRST_CHOICES','PRE_TOURNAMENT_SCORE','SEEDED_COIN_FLIP']).nullable()}).passthrough().nullable() }).nullable(),
  bracket: z.array(z.object({key:z.string(),stage:TournamentStageSchema,sequence:z.number().int().positive(),candidateAId:z.uuid(),candidateBId:z.uuid(),winnerId:z.uuid(),loserId:z.uuid(),winnerTitle:z.string(),loserTitle:z.string()}))
});
export const RoomSnapshotSchema = z.object({
  roomId: z.uuid(), name: z.string(), code: z.string(), state: z.enum(['LOBBY', 'NOMINATING', 'NOMINATIONS_LOCKED', 'MATCHUP_INTRO', 'VOTING', 'MATCHUP_RESULT', 'WINNER', 'EXPIRED']), locked: z.boolean(),
  sequence: z.number().int().nonnegative(), viewer: z.enum(['HOST', 'PARTICIPANT', 'DISPLAY']),
  viewerParticipantId: z.uuid().nullable(), viewerReady: z.boolean(), participants: z.array(ParticipantDtoSchema), displays: z.array(DisplayDtoSchema),
  rules: HouseRulesSchema, nominationDeadline: z.iso.datetime().nullable(), nominationsRevealed: z.boolean(),
  nominationProgress: z.object({ submittedParticipants: z.number().int().nonnegative(), lockedParticipants: z.number().int().nonnegative(), totalParticipants: z.number().int().nonnegative() }),
  ownSubmissions: z.array(SubmissionDtoSchema), candidates: z.array(CandidateDtoSchema), tournament: TournamentSnapshotSchema.nullable()
});
export type RoomSnapshot = z.infer<typeof RoomSnapshotSchema>;
export const ServerEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), eventId: z.uuid(), roomId: z.uuid(), sequence: z.number().int().nonnegative(), serverTimestamp: z.iso.datetime(), payload: z.unknown()
});
export const RoomSubscribeSchema = z.object({ roomId: z.uuid(), lastSequence: z.number().int().nonnegative().optional() });
export const ParticipantHeartbeatSchema = z.object({ roomId: z.uuid() });
export const DisplaySubscribeSchema = z.object({ roomId: z.uuid(), displaySessionId: z.uuid() });
export const controllerEvents = ['room:snapshot','room:participant-joined','room:participant-left','room:participant-reconnected','room:locked','room:unlocked','room:nominations-started','room:nomination-progress','room:nominations-revealed','matchup:started','matchup:vote-accepted','matchup:result','bracket:updated','room:winner','display:paired','display:revoked','room:error'] as const;
