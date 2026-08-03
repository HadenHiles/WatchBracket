CREATE TABLE "participant_plex_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"participant_id" uuid NOT NULL,
	"plex_pin_id" text,
	"plex_pin_code" text,
	"pin_expires_at" timestamp with time zone,
	"encrypted_token" text,
	"account_label" text,
	"connected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "participant_plex_accounts" ADD CONSTRAINT "participant_plex_accounts_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "participant_plex_accounts_participant_uq" ON "participant_plex_accounts" USING btree ("participant_id");