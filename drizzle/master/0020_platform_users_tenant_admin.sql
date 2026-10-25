ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "provision_to_tenants" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_user_tenant_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE cascade,
	"tenant_id" integer NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
	"tenant_user_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "platform_user_tenant_links_user_tenant_idx" ON "platform_user_tenant_links" USING btree ("user_id","tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "platform_user_tenant_links_tenant_idx" ON "platform_user_tenant_links" USING btree ("tenant_id");
