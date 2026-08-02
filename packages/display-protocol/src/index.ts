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
const TournamentCandidateSceneSchema=z.object({id:z.uuid(),title:z.string(),mediaType:z.enum(['MOVIE','TV']),releaseYear:z.number().int(),runtimeMinutes:z.number().int().nonnegative(),contentRating:z.string(),genres:z.array(z.string()),seed:z.number().int().positive(),strikes:z.number().int().nonnegative(),redemption:z.boolean()});
const TournamentStageSceneSchema=z.enum(['QUALIFIER','SPOTLIGHT','REDEMPTION','REDEMPTION_FINAL','CHAMPIONSHIP_PLAY_IN','CHAMPIONSHIP_SEMI','CHAMPIONSHIP_FINAL']);
export const MatchupIntroSceneSchema=z.object({type:z.literal('MATCHUP_INTRO'),roomName:z.string(),stage:TournamentStageSceneSchema,matchupNumber:z.number().int().positive(),totalMatchups:z.number().int().positive(),candidateA:TournamentCandidateSceneSchema,candidateB:TournamentCandidateSceneSchema,deadline:z.iso.datetime().nullable()});
export const MatchupVotingSceneSchema=z.object({type:z.literal('MATCHUP_VOTING'),roomName:z.string(),stage:TournamentStageSceneSchema,matchupNumber:z.number().int().positive(),totalMatchups:z.number().int().positive(),candidateA:TournamentCandidateSceneSchema,candidateB:TournamentCandidateSceneSchema,deadline:z.iso.datetime(),votesReceived:z.number().int().nonnegative(),eligibleVoters:z.number().int().nonnegative()});
export const MatchupResultSceneSchema=z.object({type:z.literal('MATCHUP_RESULT'),roomName:z.string(),stage:TournamentStageSceneSchema,matchupNumber:z.number().int().positive(),totalMatchups:z.number().int().positive(),winner:TournamentCandidateSceneSchema,loser:TournamentCandidateSceneSchema,votesWinner:z.number().int().nonnegative(),votesLoser:z.number().int().nonnegative(),abstentions:z.number().int().nonnegative(),tieBreak:z.string().nullable(),deadline:z.iso.datetime().nullable()});
export const WinnerSceneSchema=z.object({type:z.literal('WINNER'),roomName:z.string(),winner:TournamentCandidateSceneSchema,path:z.array(z.object({stage:TournamentStageSceneSchema,opponentTitle:z.string()}))});
export const DisplaySceneSchema = z.discriminatedUnion('type', [LobbySceneSchema, NominationProgressSceneSchema, MatchupIntroSceneSchema, MatchupVotingSceneSchema, MatchupResultSceneSchema, WinnerSceneSchema]);
export type DisplayScene = z.infer<typeof DisplaySceneSchema>;
export const DisplayEnvelopeSchema = z.object({
  schemaVersion: z.literal(1), eventId: z.uuid(), roomId: z.uuid(), sequence: z.number().int().nonnegative(), serverTimestamp: z.iso.datetime(), scene: DisplaySceneSchema
});
export type DisplayEnvelope = z.infer<typeof DisplayEnvelopeSchema>;
