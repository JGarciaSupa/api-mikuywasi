CREATE TABLE IF NOT EXISTS "mail_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	"host" varchar(255) NOT NULL,
	"port" integer DEFAULT 465 NOT NULL,
	"username" varchar(255) NOT NULL,
	"password_encrypted" text NOT NULL,
	"from_name" varchar(120),
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" integer REFERENCES "users"("id") ON DELETE SET NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mail_settings_singleton_idx" ON "mail_settings" ("singleton");
