ALTER TABLE "rooms" ADD COLUMN "nomination_auto_start_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rooms" ADD COLUMN "nomination_paused_seconds" integer;--> statement-breakpoint
CREATE INDEX "rooms_nomination_auto_start_idx" ON "rooms" USING btree ("state","nomination_auto_start_at");