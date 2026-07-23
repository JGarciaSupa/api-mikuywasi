-- Idempotente: las columnas/FKs de sales_channel y order_item ya se crean en
-- 0046 y 0047 (con IF NOT EXISTS). En una BD nueva ambas migraciones corren, así
-- que aquí se usa IF NOT EXISTS / guardas para no chocar con lo ya existente.
-- Lo único realmente nuevo de esta migración es el índice orders_branch_created_at_idx.
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "sales_channel_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "tax_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sales_channel_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sales_channel_name" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tax_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "billing_document_lines" ADD COLUMN IF NOT EXISTS "order_item_id" integer;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_items_sales_channel_id_sales_channels_id_fk') THEN
		ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sales_channel_id_sales_channels_id_fk" FOREIGN KEY ("sales_channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_sales_channel_id_sales_channels_id_fk') THEN
		ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_channel_id_sales_channels_id_fk" FOREIGN KEY ("sales_channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE no action ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_document_lines_order_item_id_order_items_id_fk') THEN
		ALTER TABLE "billing_document_lines" ADD CONSTRAINT "billing_document_lines_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "orders_branch_created_at_idx" ON "orders" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_doc_lines_order_item_unique_idx" ON "billing_document_lines" USING btree ("order_item_id");
