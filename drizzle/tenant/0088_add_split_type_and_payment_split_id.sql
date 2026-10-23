ALTER TABLE "order_splits" ADD COLUMN IF NOT EXISTS "split_type" text DEFAULT 'by_item' NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_splits" ADD COLUMN IF NOT EXISTS "custom_concept" varchar(150) DEFAULT 'Por consumo de alimentos y bebidas';
--> statement-breakpoint
ALTER TABLE "order_payments" ADD COLUMN IF NOT EXISTS "split_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_payments_split_id_order_splits_id_fk') THEN
    ALTER TABLE "order_payments" ADD CONSTRAINT "order_payments_split_id_order_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."order_splits"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_payments_split_idx" ON "order_payments" USING btree ("split_id");
