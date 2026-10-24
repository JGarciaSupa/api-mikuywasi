ALTER TABLE "order_payments" ADD COLUMN IF NOT EXISTS "tip_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tip_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_splits" ADD COLUMN IF NOT EXISTS "tip_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "tip_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;
