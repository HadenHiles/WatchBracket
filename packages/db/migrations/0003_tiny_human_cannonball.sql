CREATE TYPE "public"."media_type" AS ENUM('MOVIE', 'TV');--> statement-breakpoint
ALTER TYPE "public"."room_state" ADD VALUE 'NOMINATING' BEFORE 'EXPIRED';--> statement-breakpoint
ALTER TYPE "public"."room_state" ADD VALUE 'NOMINATIONS_LOCKED' BEFORE 'EXPIRED';--> statement-breakpoint
CREATE TABLE "media_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"catalog_key" text NOT NULL,
	"media_type" "media_type" NOT NULL,
	"title" text NOT NULL,
	"original_title" text NOT NULL,
	"release_year" integer NOT NULL,
	"runtime_minutes" integer,
	"content_rating" text,
	"genres_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"synopsis" text NOT NULL,
	"poster_url" text,
	"metadata_json" jsonb DEFAULT '{"source":"MOCK"}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"media_item_id" uuid NOT NULL,
	"rank" integer NOT NULL,
	"locked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "default_rules_json" jsonb DEFAULT '{"preset":"MOVIE_NIGHT","nominationDurationSeconds":120,"nominationSlots":2,"revealMode":"AFTER_DEADLINE"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "onboarding_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "participants" ADD COLUMN "ready" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "rules_json" jsonb DEFAULT '{"preset":"MOVIE_NIGHT","nominationDurationSeconds":120,"nominationSlots":2,"revealMode":"AFTER_DEADLINE"}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "random_seed" text DEFAULT 'watch-bracket' NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "nomination_deadline" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "nominations_revealed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "rooms_nomination_deadline_idx" ON "rooms" USING btree ("state","nomination_deadline");--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_catalog_key_uq" ON "media_items" USING btree ("catalog_key");--> statement-breakpoint
CREATE INDEX "media_items_title_idx" ON "media_items" USING btree ("title");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_room_participant_rank_uq" ON "submissions" USING btree ("room_id","participant_id","rank");--> statement-breakpoint
CREATE UNIQUE INDEX "submissions_room_participant_media_uq" ON "submissions" USING btree ("room_id","participant_id","media_item_id");--> statement-breakpoint
CREATE INDEX "submissions_room_idx" ON "submissions" USING btree ("room_id");
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_rank_check" CHECK ("submissions"."rank" between 1 and 2);
