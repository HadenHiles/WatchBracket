CREATE TABLE "watch_bracket_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"winner_media_item_id" uuid NOT NULL,
	"candidate_media_item_ids_json" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"taste_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "history_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "households" ADD COLUMN "recent_exclusion_days" integer DEFAULT 30 NOT NULL;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "replay_of_room_id" uuid;--> statement-breakpoint
ALTER TABLE "watch_bracket_history" ADD CONSTRAINT "watch_bracket_history_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_bracket_history" ADD CONSTRAINT "watch_bracket_history_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watch_bracket_history" ADD CONSTRAINT "watch_bracket_history_winner_media_item_id_media_items_id_fk" FOREIGN KEY ("winner_media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "watch_bracket_history_room_uq" ON "watch_bracket_history" USING btree ("room_id");--> statement-breakpoint
CREATE INDEX "watch_bracket_history_household_date_idx" ON "watch_bracket_history" USING btree ("household_id","completed_at");--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_replay_of_room_id_rooms_id_fk" FOREIGN KEY ("replay_of_room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;