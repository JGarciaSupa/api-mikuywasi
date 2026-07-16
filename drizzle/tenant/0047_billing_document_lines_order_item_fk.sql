ALTER TABLE "billing_document_lines" ADD COLUMN IF NOT EXISTS "order_item_id" integer REFERENCES "order_items"("id") ON DELETE cascade;
CREATE UNIQUE INDEX IF NOT EXISTS "billing_doc_lines_order_item_unique_idx" ON "billing_document_lines" ("order_item_id");
