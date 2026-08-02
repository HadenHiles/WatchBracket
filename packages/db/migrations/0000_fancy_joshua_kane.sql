CREATE TYPE "public"."actor_type" AS ENUM('ADMIN', 'PARTICIPANT', 'DISPLAY', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('ADMIN');--> statement-breakpoint
CREATE TYPE "public"."display_kind" AS ENUM('BROWSER');--> statement-breakpoint
CREATE TYPE "public"."participant_role" AS ENUM('HOST', 'PARTICIPANT', 'CO_HOST', 'SPECTATOR');--> statement-breakpoint
CREATE TYPE "public"."room_state" AS ENUM('LOBBY', 'EXPIRED');--> statement-breakpoint
CREATE TABLE "admin_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"session_token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'ADMIN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"room_id" uuid,
	"actor_type" "actor_type" NOT NULL,
	"actor_id" uuid,
	"event_type" text NOT NULL,
	"safe_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "display_pairing_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"pairing_code_hash" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "display_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"kind" "display_kind" DEFAULT 'BROWSER' NOT NULL,
	"display_name" text NOT NULL,
	"session_token_hash" text NOT NULL,
	"paired_by_participant_id" uuid NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"region" text DEFAULT 'CA' NOT NULL,
	"time_zone" text DEFAULT 'America/Toronto' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"actor_identifier" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"response_status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"normalized_nickname" text NOT NULL,
	"display_nickname" text NOT NULL,
	"role" "participant_role" DEFAULT 'PARTICIPANT' NOT NULL,
	"session_token_hash" text NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"state" "room_state" DEFAULT 'LOBBY' NOT NULL,
	"host_participant_id" uuid,
	"locked_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL,
	"version" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_pairing_codes" ADD CONSTRAINT "display_pairing_codes_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_sessions" ADD CONSTRAINT "display_sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_sessions" ADD CONSTRAINT "display_sessions_paired_by_participant_id_participants_id_fk" FOREIGN KEY ("paired_by_participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_sessions_token_uq" ON "admin_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "admin_sessions_active_idx" ON "admin_sessions" USING btree ("admin_user_id","expires_at","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "admin_users_email_uq" ON "admin_users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "display_pairing_codes_hash_uq" ON "display_pairing_codes" USING btree ("pairing_code_hash");--> statement-breakpoint
CREATE INDEX "display_pairing_codes_expiry_idx" ON "display_pairing_codes" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "display_sessions_token_uq" ON "display_sessions" USING btree ("session_token_hash");--> statement-breakpoint
CREATE INDEX "display_sessions_active_idx" ON "display_sessions" USING btree ("room_id","expires_at","revoked_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_scope_actor_key_uq" ON "idempotency_keys" USING btree ("scope","actor_identifier","idempotency_key");--> statement-breakpoint
CREATE INDEX "idempotency_expiry_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_token_uq" ON "participants" USING btree ("session_token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "participants_active_nickname_uq" ON "participants" USING btree ("room_id","normalized_nickname") WHERE "participants"."removed_at" is null;--> statement-breakpoint
CREATE INDEX "participants_room_idx" ON "participants" USING btree ("room_id");--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_code_uq" ON "rooms" USING btree ("code");--> statement-breakpoint
CREATE INDEX "rooms_expiration_idx" ON "rooms" USING btree ("state","expires_at");