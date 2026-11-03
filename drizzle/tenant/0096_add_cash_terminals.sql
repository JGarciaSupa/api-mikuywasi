ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "require_cash_terminal" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "require_cash_location" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_terminals" (
	"id" serial PRIMARY KEY NOT NULL,
	"register_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"name" varchar(100),
	"token_hash" varchar(64) NOT NULL,
	"paired_by_id" integer,
	"paired_at" timestamp with time zone DEFAULT now(),
	"last_seen_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_id" integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_terminal_pairing_codes" (
	"id" serial PRIMARY KEY NOT NULL,
	"register_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"code_hash" varchar(64) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_by_id" integer,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"terminal_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_close_authorizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"request_token_hash" varchar(64) NOT NULL,
	"requested_by_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"code_hash" varchar(64),
	"approved_by_id" integer,
	"approved_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_terminals_register_id_cash_registers_id_fk') THEN
    ALTER TABLE "cash_terminals" ADD CONSTRAINT "cash_terminals_register_id_cash_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_terminals_branch_id_branches_id_fk') THEN
    ALTER TABLE "cash_terminals" ADD CONSTRAINT "cash_terminals_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_terminals_paired_by_id_users_id_fk') THEN
    ALTER TABLE "cash_terminals" ADD CONSTRAINT "cash_terminals_paired_by_id_users_id_fk" FOREIGN KEY ("paired_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_terminals_revoked_by_id_users_id_fk') THEN
    ALTER TABLE "cash_terminals" ADD CONSTRAINT "cash_terminals_revoked_by_id_users_id_fk" FOREIGN KEY ("revoked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_terminal_pairing_codes_register_id_cash_registers_id_fk') THEN
    ALTER TABLE "cash_terminal_pairing_codes" ADD CONSTRAINT "cash_terminal_pairing_codes_register_id_cash_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_terminal_pairing_codes_branch_id_branches_id_fk') THEN
    ALTER TABLE "cash_terminal_pairing_codes" ADD CONSTRAINT "cash_terminal_pairing_codes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_terminal_pairing_codes_created_by_id_users_id_fk') THEN
    ALTER TABLE "cash_terminal_pairing_codes" ADD CONSTRAINT "cash_terminal_pairing_codes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_terminal_pairing_codes_terminal_id_cash_terminals_id_fk') THEN
    ALTER TABLE "cash_terminal_pairing_codes" ADD CONSTRAINT "cash_terminal_pairing_codes_terminal_id_cash_terminals_id_fk" FOREIGN KEY ("terminal_id") REFERENCES "public"."cash_terminals"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_close_authorizations_session_id_cash_sessions_id_fk') THEN
    ALTER TABLE "cash_close_authorizations" ADD CONSTRAINT "cash_close_authorizations_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_close_authorizations_requested_by_id_users_id_fk') THEN
    ALTER TABLE "cash_close_authorizations" ADD CONSTRAINT "cash_close_authorizations_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_close_authorizations_approved_by_id_users_id_fk') THEN
    ALTER TABLE "cash_close_authorizations" ADD CONSTRAINT "cash_close_authorizations_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_terminals_token_hash_idx" ON "cash_terminals" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_terminals_register_idx" ON "cash_terminals" USING btree ("register_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_terminals_branch_idx" ON "cash_terminals" USING btree ("branch_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_terminal_pairing_codes_token_hash_idx" ON "cash_terminal_pairing_codes" USING btree ("token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_terminal_pairing_codes_code_hash_idx" ON "cash_terminal_pairing_codes" USING btree ("code_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_terminal_pairing_codes_register_idx" ON "cash_terminal_pairing_codes" USING btree ("register_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "cash_close_authorizations_request_token_hash_idx" ON "cash_close_authorizations" USING btree ("request_token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_close_authorizations_session_idx" ON "cash_close_authorizations" USING btree ("session_id");
