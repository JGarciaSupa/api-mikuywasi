ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "qr_ordering_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "qr_pin_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "qr_escalation_seconds" integer DEFAULT 90 NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "qr_session_expire_hours" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "qr_call_cooldown_seconds" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "qr_sales_channel_id" integer;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'branches_qr_sales_channel_id_fk') THEN
    ALTER TABLE "branches" ADD CONSTRAINT "branches_qr_sales_channel_id_fk" FOREIGN KEY ("qr_sales_channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "table_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"table_id" integer NOT NULL,
	"order_id" varchar(12),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"pin_hash" varchar(255),
	"pin_required" boolean DEFAULT true NOT NULL,
	"opened_by_id" integer,
	"closed_by_id" integer,
	"close_reason" varchar(40),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_branch_id_fk') THEN
    ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_table_id_fk') THEN
    ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_order_id_fk') THEN
    ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_order_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_opened_by_id_fk') THEN
    ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_opened_by_id_fk" FOREIGN KEY ("opened_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_sessions_closed_by_id_fk') THEN
    ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_closed_by_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_sessions_branch_idx" ON "table_sessions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_sessions_table_idx" ON "table_sessions" USING btree ("table_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_sessions_order_idx" ON "table_sessions" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "table_sessions_one_open_per_table_idx" ON "table_sessions" USING btree ("table_id") WHERE "status" = 'open';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "table_session_participants" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"alias" varchar(40),
	"device_id" varchar(64) NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"left_at" timestamp with time zone
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_session_participants_session_id_fk') THEN
    ALTER TABLE "table_session_participants" ADD CONSTRAINT "table_session_participants_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_session_participants_session_idx" ON "table_session_participants" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "table_session_participants_session_device_idx" ON "table_session_participants" USING btree ("session_id", "device_id");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "table_session_rounds" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"participant_id" integer NOT NULL,
	"items" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reject_reason" varchar(200),
	"decided_by_id" integer,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_session_rounds_session_id_fk') THEN
    ALTER TABLE "table_session_rounds" ADD CONSTRAINT "table_session_rounds_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_session_rounds_participant_id_fk') THEN
    ALTER TABLE "table_session_rounds" ADD CONSTRAINT "table_session_rounds_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."table_session_participants"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'table_session_rounds_decided_by_id_fk') THEN
    ALTER TABLE "table_session_rounds" ADD CONSTRAINT "table_session_rounds_decided_by_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_session_rounds_session_idx" ON "table_session_rounds" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "table_session_rounds_status_idx" ON "table_session_rounds" USING btree ("session_id", "status");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "waiter_calls" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"table_id" integer NOT NULL,
	"participant_id" integer,
	"reason" varchar(30) NOT NULL,
	"note" varchar(120),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"assigned_waiter_id" integer,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"taken_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"escalated_at" timestamp with time zone
);--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waiter_calls_session_id_fk') THEN
    ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."table_sessions"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waiter_calls_branch_id_fk') THEN
    ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_branch_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waiter_calls_table_id_fk') THEN
    ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_table_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waiter_calls_participant_id_fk') THEN
    ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_participant_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."table_session_participants"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'waiter_calls_assigned_waiter_id_fk') THEN
    ALTER TABLE "waiter_calls" ADD CONSTRAINT "waiter_calls_assigned_waiter_id_fk" FOREIGN KEY ("assigned_waiter_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waiter_calls_branch_status_idx" ON "waiter_calls" USING btree ("branch_id", "status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "waiter_calls_session_idx" ON "waiter_calls" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "waiter_calls_one_open_reason_idx" ON "waiter_calls" USING btree ("session_id", "reason") WHERE "status" IN ('open', 'taken', 'escalated');
