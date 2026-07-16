ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sales_channel_id" integer REFERENCES "sales_channels"("id");
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "sales_channel_name" varchar(100);
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "tax_breakdown" jsonb;

ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "sales_channel_id" integer REFERENCES "sales_channels"("id");
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "tax_snapshot" jsonb;

ALTER TABLE "billing_documents" DROP COLUMN IF EXISTS "sales_channel_id";
