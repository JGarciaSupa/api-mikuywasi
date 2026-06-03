ALTER TABLE "billing_documents" ADD COLUMN "emisor_ruc" varchar(15);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "emisor_name" varchar(200);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "emisor_address" text;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "emisor_logo_url" text;