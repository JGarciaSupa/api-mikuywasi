CREATE TABLE IF NOT EXISTS "order_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(12) NOT NULL,
	"payment_method_id" integer,
	"payment_method" varchar(100) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"is_cash" boolean DEFAULT false NOT NULL,
	"retention_percentage" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"retention_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL,
	"created_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN IF NOT EXISTS "created_by_id" integer;
--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN IF NOT EXISTS "retention_percentage" numeric(5, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN IF NOT EXISTS "retention_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN IF NOT EXISTS "is_cash" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_order_id_orders_id_fk') THEN
    ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_payment_method_id_payment_methods_id_fk') THEN
    ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_created_by_id_users_id_fk') THEN
    ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_payments_order_idx" ON "order_payments" USING btree ("order_id");
