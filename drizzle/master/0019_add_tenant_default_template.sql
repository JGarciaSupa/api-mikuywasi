ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "is_default_template" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "tenants_default_template_unique_idx" ON "tenants" USING btree ("is_default_template") WHERE "is_default_template" = true;
