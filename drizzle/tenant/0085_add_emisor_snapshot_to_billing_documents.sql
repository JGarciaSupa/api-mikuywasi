ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "emisor_ruc" varchar(15);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "emisor_name" varchar(200);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "emisor_address" text;
