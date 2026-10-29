ALTER TABLE "audit_log" ADD COLUMN IF NOT EXISTS "geo_captured_at" timestamp with time zone;
