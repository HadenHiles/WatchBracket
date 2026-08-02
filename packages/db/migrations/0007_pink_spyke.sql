ALTER TYPE "public"."candidate_source" ADD VALUE 'TMDB_WILDCARD';--> statement-breakpoint
CREATE TABLE "availability_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid,
	"media_item_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"status" text NOT NULL,
	"details_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "score_components_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "tmdb_id" integer;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "release_date" date;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "backdrop_url" text;--> statement-breakpoint
ALTER TABLE "media_items" ADD COLUMN "metadata_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "availability_snapshots" ADD CONSTRAINT "availability_snapshots_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_snapshots" ADD CONSTRAINT "availability_snapshots_media_item_id_media_items_id_fk" FOREIGN KEY ("media_item_id") REFERENCES "public"."media_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "availability_media_expiry_idx" ON "availability_snapshots" USING btree ("media_item_id","expires_at");--> statement-breakpoint
CREATE INDEX "availability_room_idx" ON "availability_snapshots" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "media_items_tmdb_identity_uq" ON "media_items" USING btree ("media_type","tmdb_id");