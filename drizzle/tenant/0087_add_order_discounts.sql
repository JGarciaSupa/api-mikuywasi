ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_reason_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_motivo" varchar(200);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_mode" varchar(20);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_value" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_by_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "discount_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_discount_by_id_users_id_fk') THEN
    ALTER TABLE "orders" ADD CONSTRAINT "orders_discount_by_id_users_id_fk" FOREIGN KEY ("discount_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
