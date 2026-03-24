ALTER TABLE "tenants" ALTER COLUMN "address" SET DATA TYPE jsonb;--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "schedules" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "tenants" DROP COLUMN "category";