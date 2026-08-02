ALTER TABLE "cast_launch_tokens" ADD COLUMN "issued_to_host_participant_id" uuid;--> statement-breakpoint
UPDATE "cast_launch_tokens" AS "launch"
SET "issued_to_host_participant_id" = "room"."host_participant_id"
FROM "rooms" AS "room"
WHERE "launch"."room_id" = "room"."id";--> statement-breakpoint
ALTER TABLE "cast_launch_tokens" ALTER COLUMN "issued_to_host_participant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cast_launch_tokens" ADD CONSTRAINT "cast_launch_tokens_issued_to_host_participant_id_participants_id_fk" FOREIGN KEY ("issued_to_host_participant_id") REFERENCES "public"."participants"("id") ON DELETE cascade ON UPDATE no action;
