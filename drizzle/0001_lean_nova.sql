ALTER TABLE "plans" ADD COLUMN "visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "deleted_at" timestamp with time zone;