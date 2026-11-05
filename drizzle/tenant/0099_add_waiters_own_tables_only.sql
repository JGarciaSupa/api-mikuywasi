ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "waiters_own_tables_only" boolean DEFAULT false NOT NULL;
