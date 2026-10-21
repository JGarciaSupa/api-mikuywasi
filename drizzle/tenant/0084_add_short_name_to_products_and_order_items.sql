ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "short_name" varchar(50);--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "short_name" varchar(50);
