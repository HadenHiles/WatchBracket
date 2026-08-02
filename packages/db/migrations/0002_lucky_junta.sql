ALTER TYPE "public"."display_kind" ADD VALUE 'CAST';--> statement-breakpoint
CREATE TABLE "cast_launch_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"issued_to_host_session_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"protocol_version" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"receiver_session_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cast_launch_tokens" ADD CONSTRAINT "cast_launch_tokens_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_launch_tokens" ADD CONSTRAINT "cast_launch_tokens_issued_to_host_session_id_admin_sessions_id_fk" FOREIGN KEY ("issued_to_host_session_id") REFERENCES "public"."admin_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cast_launch_tokens" ADD CONSTRAINT "cast_launch_tokens_receiver_session_id_display_sessions_id_fk" FOREIGN KEY ("receiver_session_id") REFERENCES "public"."display_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cast_launch_tokens_hash_uq" ON "cast_launch_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "cast_launch_tokens_expiry_idx" ON "cast_launch_tokens" USING btree ("room_id","expires_at","consumed_at");