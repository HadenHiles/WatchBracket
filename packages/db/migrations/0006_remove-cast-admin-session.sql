ALTER TABLE "cast_launch_tokens" DROP CONSTRAINT "cast_launch_tokens_issued_to_host_session_id_admin_sessions_id_fk";
--> statement-breakpoint
ALTER TABLE "cast_launch_tokens" ALTER COLUMN "issued_to_host_participant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "cast_launch_tokens" DROP COLUMN "issued_to_host_session_id";