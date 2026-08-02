CREATE TYPE "public"."candidate_source" AS ENUM('DIRECT', 'MOCK_WILDCARD');--> statement-breakpoint
CREATE TYPE "public"."candidate_status" AS ENUM('ACTIVE', 'ELIMINATED', 'WINNER');--> statement-breakpoint
CREATE TYPE "public"."matchup_status" AS ENUM('INTRO', 'VOTING', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "public"."round_stage" AS ENUM('QUALIFIER', 'SPOTLIGHT', 'REDEMPTION', 'REDEMPTION_FINAL', 'CHAMPIONSHIP_PLAY_IN', 'CHAMPIONSHIP_SEMI', 'CHAMPIONSHIP_FINAL');--> statement-breakpoint
CREATE TYPE "public"."round_status" AS ENUM('ACTIVE', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."tournament_status" AS ENUM('ACTIVE', 'COMPLETED');--> statement-breakpoint
ALTER TYPE "public"."room_state" ADD VALUE 'MATCHUP_INTRO' BEFORE 'EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."room_state" ADD VALUE 'VOTING' BEFORE 'EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."room_state" ADD VALUE 'MATCHUP_RESULT' BEFORE 'EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."room_state" ADD VALUE 'WINNER' BEFORE 'EXPIRED';--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"source_type" "candidate_source" NOT NULL,
	"score_total" integer DEFAULT 0 NOT NULL,
	"support_count" integer DEFAULT 0 NOT NULL,
	"first_choice_count" integer DEFAULT 0 NOT NULL,
	"nominator_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reason_codes_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seed" integer NOT NULL,
	"strikes" integer DEFAULT 0 NOT NULL,
	"status" "candidate_status" DEFAULT 'ACTIVE' NOT NULL,
	"redemption" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"round_id" uuid NOT NULL,
	"engine_key" text NOT NULL,
	"sequence" integer NOT NULL,
	"stage" "round_stage" NOT NULL,
	"candidate_a_id" uuid NOT NULL,
	"candidate_b_id" uuid NOT NULL,
	"winner_candidate_id" uuid,
	"loser_candidate_id" uuid,
	"status" "matchup_status" DEFAULT 'INTRO' NOT NULL,
	"eligible_participant_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"intro_ends_at" timestamp with time zone NOT NULL,
	"voting_starts_at" timestamp with time zone,
	"voting_ends_at" timestamp with time zone,
	"result_ends_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"advanced_at" timestamp with time zone,
	"resolution_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"stage" "round_stage" NOT NULL,
	"sequence" integer NOT NULL,
	"status" "round_status" DEFAULT 'ACTIVE' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"format" integer NOT NULL,
	"vote_duration_seconds" integer NOT NULL,
	"engine_state_json" jsonb NOT NULL,
	"status" "tournament_status" DEFAULT 'ACTIVE' NOT NULL,
	"champion_candidate_id" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tournaments_format_check" CHECK ("tournaments"."format" in (8, 12, 16)),
	CONSTRAINT "tournaments_vote_duration_check" CHECK ("tournaments"."vote_duration_seconds" between 10 and 120)
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"matchup_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"candidate_id" uuid,
	"abstained" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "votes_choice_check" CHECK (("votes"."abstained" and "votes"."candidate_id" is null) or (not "votes"."abstained" and "votes"."candidate_id" is not null))
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_candidate_a_id_candidates_id_fk" FOREIGN KEY ("candidate_a_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_candidate_b_id_candidates_id_fk" FOREIGN KEY ("candidate_b_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_winner_candidate_id_candidates_id_fk" FOREIGN KEY ("winner_candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchups" ADD CONSTRAINT "matchups_loser_candidate_id_candidates_id_fk" FOREIGN KEY ("loser_candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_champion_candidate_id_candidates_id_fk" FOREIGN KEY ("champion_candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_matchup_id_matchups_id_fk" FOREIGN KEY ("matchup_id") REFERENCES "public"."matchups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_room_media_uq" ON "candidates" USING btree ("room_id","media_item_id");--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_room_seed_uq" ON "candidates" USING btree ("room_id","seed");--> statement-breakpoint
CREATE INDEX "candidates_room_status_idx" ON "candidates" USING btree ("room_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "matchups_tournament_engine_key_uq" ON "matchups" USING btree ("tournament_id","engine_key");--> statement-breakpoint
CREATE UNIQUE INDEX "matchups_tournament_sequence_uq" ON "matchups" USING btree ("tournament_id","sequence");--> statement-breakpoint
CREATE INDEX "matchups_due_idx" ON "matchups" USING btree ("status","intro_ends_at","voting_ends_at","result_ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_tournament_stage_uq" ON "rounds" USING btree ("tournament_id","stage");--> statement-breakpoint
CREATE UNIQUE INDEX "rounds_tournament_sequence_uq" ON "rounds" USING btree ("tournament_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_room_uq" ON "tournaments" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "votes_matchup_participant_uq" ON "votes" USING btree ("matchup_id","participant_id");--> statement-breakpoint
CREATE INDEX "votes_matchup_idx" ON "votes" USING btree ("matchup_id");