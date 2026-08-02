import { sql } from 'drizzle-orm';
import { bigint, boolean, check, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const adminRole = pgEnum('admin_role', ['ADMIN']);
export const roomState = pgEnum('room_state', ['LOBBY', 'NOMINATING', 'NOMINATIONS_LOCKED', 'MATCHUP_INTRO', 'VOTING', 'MATCHUP_RESULT', 'WINNER', 'EXPIRED']);
export const participantRole = pgEnum('participant_role', ['HOST', 'PARTICIPANT', 'CO_HOST', 'SPECTATOR']);
export const displayKind = pgEnum('display_kind', ['BROWSER', 'CAST']);
export const actorType = pgEnum('actor_type', ['ADMIN', 'PARTICIPANT', 'DISPLAY', 'SYSTEM']);
export const mediaType = pgEnum('media_type', ['MOVIE', 'TV']);
export const candidateSource = pgEnum('candidate_source', ['DIRECT', 'MOCK_WILDCARD']);
export const candidateStatus = pgEnum('candidate_status', ['ACTIVE', 'ELIMINATED', 'WINNER']);
export const tournamentStatus = pgEnum('tournament_status', ['ACTIVE', 'COMPLETED']);
export const roundStage = pgEnum('round_stage', ['QUALIFIER', 'SPOTLIGHT', 'REDEMPTION', 'REDEMPTION_FINAL', 'CHAMPIONSHIP_PLAY_IN', 'CHAMPIONSHIP_SEMI', 'CHAMPIONSHIP_FINAL']);
export const roundStatus = pgEnum('round_status', ['ACTIVE', 'COMPLETED']);
export const matchupStatus = pgEnum('matchup_status', ['INTRO', 'VOTING', 'RESOLVED']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
};

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: adminRole('role').notNull().default('ADMIN'),
  ...timestamps,
  lastLoginAt: timestamp('last_login_at', { withTimezone: true })
}, (table) => [uniqueIndex('admin_users_email_uq').on(table.email)]);

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  region: text('region').notNull().default('CA'),
  timeZone: text('time_zone').notNull().default('America/Toronto'),
  defaultRules: jsonb('default_rules_json').notNull().default({ preset: 'MOVIE_NIGHT', nominationDurationSeconds: 120, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' }),
  onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
  ...timestamps
});

export const adminSessions = pgTable('admin_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  adminUserId: uuid('admin_user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  tokenHash: text('session_token_hash').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('admin_sessions_token_uq').on(table.tokenHash), index('admin_sessions_active_idx').on(table.adminUserId, table.expiresAt, table.revokedAt)]);

export const rooms = pgTable('rooms', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id),
  code: text('code').notNull(),
  name: text('name').notNull(),
  state: roomState('state').notNull().default('LOBBY'),
  rules: jsonb('rules_json').notNull().default({ preset: 'MOVIE_NIGHT', nominationDurationSeconds: 120, nominationSlots: 2, revealMode: 'AFTER_DEADLINE' }),
  randomSeed: text('random_seed').notNull().default('watch-bracket'),
  hostParticipantId: uuid('host_participant_id').references((): AnyPgColumn => participants.id),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  nominationDeadline: timestamp('nomination_deadline', { withTimezone: true }),
  nominationsRevealedAt: timestamp('nominations_revealed_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  version: bigint('version', { mode: 'number' }).notNull().default(0),
  ...timestamps
}, (table) => [uniqueIndex('rooms_code_uq').on(table.code), index('rooms_expiration_idx').on(table.state, table.expiresAt), index('rooms_nomination_deadline_idx').on(table.state, table.nominationDeadline)]);

export const participants = pgTable('participants', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  normalizedNickname: text('normalized_nickname').notNull(),
  displayNickname: text('display_nickname').notNull(),
  role: participantRole('role').notNull().default('PARTICIPANT'),
  tokenHash: text('session_token_hash').notNull(),
  joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  ready: boolean('ready').notNull().default(false),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex('participants_token_uq').on(table.tokenHash),
  uniqueIndex('participants_active_nickname_uq').on(table.roomId, table.normalizedNickname).where(sql`${table.removedAt} is null`),
  index('participants_room_idx').on(table.roomId)
]);

export const displayPairingCodes = pgTable('display_pairing_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  codeHash: text('pairing_code_hash').notNull(),
  attemptCount: integer('attempt_count').notNull().default(0),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('display_pairing_codes_hash_uq').on(table.codeHash), index('display_pairing_codes_expiry_idx').on(table.expiresAt)]);

export const displaySessions = pgTable('display_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  kind: displayKind('kind').notNull().default('BROWSER'),
  displayName: text('display_name').notNull(),
  tokenHash: text('session_token_hash').notNull(),
  pairedByParticipantId: uuid('paired_by_participant_id').notNull().references(() => participants.id),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('display_sessions_token_uq').on(table.tokenHash), index('display_sessions_active_idx').on(table.roomId, table.expiresAt, table.revokedAt)]);

export const castLaunchTokens = pgTable('cast_launch_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  issuedToHostSessionId: uuid('issued_to_host_session_id').notNull().references(() => adminSessions.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull(),
  protocolVersion: integer('protocol_version').notNull().default(1),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  receiverSessionId: uuid('receiver_session_id').references(() => displaySessions.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('cast_launch_tokens_hash_uq').on(table.tokenHash), index('cast_launch_tokens_expiry_idx').on(table.roomId, table.expiresAt, table.consumedAt)]);

export const mediaItems = pgTable('media_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  catalogKey: text('catalog_key').notNull(),
  mediaType: mediaType('media_type').notNull(),
  title: text('title').notNull(),
  originalTitle: text('original_title').notNull(),
  releaseYear: integer('release_year').notNull(),
  runtimeMinutes: integer('runtime_minutes'),
  contentRating: text('content_rating'),
  genres: jsonb('genres_json').notNull().default([]),
  synopsis: text('synopsis').notNull(),
  posterUrl: text('poster_url'),
  metadata: jsonb('metadata_json').notNull().default({ source: 'MOCK' }),
  ...timestamps
}, (table) => [uniqueIndex('media_items_catalog_key_uq').on(table.catalogKey), index('media_items_title_idx').on(table.title)]);

export const submissions = pgTable('submissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id),
  rank: integer('rank').notNull(),
  lockedAt: timestamp('locked_at', { withTimezone: true }),
  ...timestamps
}, (table) => [
  uniqueIndex('submissions_room_participant_rank_uq').on(table.roomId, table.participantId, table.rank),
  uniqueIndex('submissions_room_participant_media_uq').on(table.roomId, table.participantId, table.mediaItemId),
  index('submissions_room_idx').on(table.roomId),
  check('submissions_rank_check', sql`${table.rank} between 1 and 2`)
]);

export const candidates = pgTable('candidates', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  mediaItemId: uuid('media_item_id').notNull().references(() => mediaItems.id),
  sourceType: candidateSource('source_type').notNull(),
  scoreTotal: integer('score_total').notNull().default(0),
  supportCount: integer('support_count').notNull().default(0),
  firstChoiceCount: integer('first_choice_count').notNull().default(0),
  nominatorIds: jsonb('nominator_ids_json').notNull().default([]),
  reasonCodes: jsonb('reason_codes_json').notNull().default([]),
  seed: integer('seed').notNull(),
  strikes: integer('strikes').notNull().default(0),
  status: candidateStatus('status').notNull().default('ACTIVE'),
  redemption: boolean('redemption').notNull().default(false),
  ...timestamps
}, (table) => [uniqueIndex('candidates_room_media_uq').on(table.roomId, table.mediaItemId), uniqueIndex('candidates_room_seed_uq').on(table.roomId, table.seed), index('candidates_room_status_idx').on(table.roomId, table.status)]);

export const tournaments = pgTable('tournaments', {
  id: uuid('id').primaryKey().defaultRandom(),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  format: integer('format').notNull(),
  voteDurationSeconds: integer('vote_duration_seconds').notNull(),
  engineState: jsonb('engine_state_json').notNull(),
  status: tournamentStatus('status').notNull().default('ACTIVE'),
  championCandidateId: uuid('champion_candidate_id').references(() => candidates.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  ...timestamps
}, (table) => [uniqueIndex('tournaments_room_uq').on(table.roomId), check('tournaments_format_check', sql`${table.format} in (8, 12, 16)`), check('tournaments_vote_duration_check', sql`${table.voteDurationSeconds} between 10 and 120`)]);

export const rounds = pgTable('rounds', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  stage: roundStage('stage').notNull(),
  sequence: integer('sequence').notNull(),
  status: roundStatus('status').notNull().default('ACTIVE'),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('rounds_tournament_stage_uq').on(table.tournamentId, table.stage), uniqueIndex('rounds_tournament_sequence_uq').on(table.tournamentId, table.sequence)]);

export const matchups = pgTable('matchups', {
  id: uuid('id').primaryKey().defaultRandom(),
  tournamentId: uuid('tournament_id').notNull().references(() => tournaments.id, { onDelete: 'cascade' }),
  roomId: uuid('room_id').notNull().references(() => rooms.id, { onDelete: 'cascade' }),
  roundId: uuid('round_id').notNull().references(() => rounds.id, { onDelete: 'cascade' }),
  engineKey: text('engine_key').notNull(),
  sequence: integer('sequence').notNull(),
  stage: roundStage('stage').notNull(),
  candidateAId: uuid('candidate_a_id').notNull().references(() => candidates.id),
  candidateBId: uuid('candidate_b_id').notNull().references(() => candidates.id),
  winnerCandidateId: uuid('winner_candidate_id').references(() => candidates.id),
  loserCandidateId: uuid('loser_candidate_id').references(() => candidates.id),
  status: matchupStatus('status').notNull().default('INTRO'),
  eligibleParticipantIds: jsonb('eligible_participant_ids_json').notNull().default([]),
  introEndsAt: timestamp('intro_ends_at', { withTimezone: true }).notNull(),
  votingStartsAt: timestamp('voting_starts_at', { withTimezone: true }),
  votingEndsAt: timestamp('voting_ends_at', { withTimezone: true }),
  resultEndsAt: timestamp('result_ends_at', { withTimezone: true }),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  advancedAt: timestamp('advanced_at', { withTimezone: true }),
  resolution: jsonb('resolution_json').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('matchups_tournament_engine_key_uq').on(table.tournamentId, table.engineKey), uniqueIndex('matchups_tournament_sequence_uq').on(table.tournamentId, table.sequence), index('matchups_due_idx').on(table.status, table.introEndsAt, table.votingEndsAt, table.resultEndsAt)]);

export const votes = pgTable('votes', {
  id: uuid('id').primaryKey().defaultRandom(),
  matchupId: uuid('matchup_id').notNull().references(() => matchups.id, { onDelete: 'cascade' }),
  participantId: uuid('participant_id').notNull().references(() => participants.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id').references(() => candidates.id),
  abstained: boolean('abstained').notNull().default(false),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('votes_matchup_participant_uq').on(table.matchupId, table.participantId), index('votes_matchup_idx').on(table.matchupId), check('votes_choice_check', sql`(${table.abstained} and ${table.candidateId} is null) or (not ${table.abstained} and ${table.candidateId} is not null)`)]);

export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  scope: text('scope').notNull(),
  actorIdentifier: text('actor_identifier').notNull(),
  key: text('idempotency_key').notNull(),
  requestFingerprint: text('request_fingerprint').notNull(),
  responseStatus: integer('response_status').notNull(),
  responseBody: jsonb('response_body').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex('idempotency_scope_actor_key_uq').on(table.scope, table.actorIdentifier, table.key), index('idempotency_expiry_idx').on(table.expiresAt)]);

export const auditEvents = pgTable('audit_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  householdId: uuid('household_id').notNull().references(() => households.id),
  roomId: uuid('room_id').references(() => rooms.id, { onDelete: 'set null' }),
  actorType: actorType('actor_type').notNull(),
  actorId: uuid('actor_id'),
  eventType: text('event_type').notNull(),
  metadata: jsonb('safe_metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});
