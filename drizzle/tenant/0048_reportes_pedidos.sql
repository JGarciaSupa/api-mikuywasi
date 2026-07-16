ALTER TABLE "order_items" ADD COLUMN "sales_channel_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "tax_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sales_channel_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "sales_channel_name" varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "tax_breakdown" jsonb;--> statement-breakpoint
ALTER TABLE "billing_document_lines" ADD COLUMN "order_item_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_sales_channel_id_sales_channels_id_fk" FOREIGN KEY ("sales_channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_sales_channel_id_sales_channels_id_fk" FOREIGN KEY ("sales_channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document_lines" ADD CONSTRAINT "billing_document_lines_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_branch_created_at_idx" ON "orders" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_doc_lines_order_item_unique_idx" ON "billing_document_lines" USING btree ("order_item_id");