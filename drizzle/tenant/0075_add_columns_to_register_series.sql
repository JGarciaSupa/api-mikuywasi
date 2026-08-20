ALTER TABLE "cash_register_document_series" ADD COLUMN "series" varchar(10);--> statement-breakpoint
ALTER TABLE "cash_register_document_series" ADD COLUMN "description" varchar(200);--> statement-breakpoint
ALTER TABLE "cash_register_document_series" ADD COLUMN "receipt_type_code" varchar(20);--> statement-breakpoint
ALTER TABLE "cash_register_document_series" ADD COLUMN "initial_sequential" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_register_document_series" ADD COLUMN "last_sequential" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_register_document_series" ADD COLUMN "is_active_facturacion" boolean DEFAULT true NOT NULL;--> statement-breakpoint

UPDATE "cash_register_document_series" crds
SET "series" = bs."series",
    "description" = bs."description",
    "receipt_type_code" = bs."receipt_type_code",
    "initial_sequential" = bs."initial_sequential",
    "last_sequential" = bs."last_sequential",
    "is_active_facturacion" = bs."is_active"
FROM "billing_series" bs
WHERE crds."series_id" = bs."id";