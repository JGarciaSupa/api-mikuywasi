ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "shared_cash_session" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_session_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_session_participants_session_id_cash_sessions_id_fk') THEN
    ALTER TABLE "cash_session_participants" ADD CONSTRAINT "cash_session_participants_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_session_participants_user_id_users_id_fk') THEN
    ALTER TABLE "cash_session_participants" ADD CONSTRAINT "cash_session_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_session_participants_session_user_idx" ON "cash_session_participants" USING btree ("session_id","user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_session_participants_user_idx" ON "cash_session_participants" USING btree ("user_id");
