ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "taxes" jsonb;--> statement-breakpoint
ALTER TABLE "product_sales_channel_prices" ADD COLUMN IF NOT EXISTS "taxes" jsonb;--> statement-breakpoint
ALTER TABLE "product_sales_channel_prices" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
