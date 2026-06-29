ALTER TABLE "countries" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "currencies" ADD COLUMN "is_active" boolean DEFAULT false NOT NULL;