ALTER TABLE "billing_series" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "billing_series" CASCADE;--> statement-breakpoint
ALTER TABLE "billing_documents" DROP CONSTRAINT IF EXISTS "billing_documents_series_id_billing_series_id_fk";
--> statement-breakpoint
ALTER TABLE "cash_register_document_series" DROP CONSTRAINT IF EXISTS "cash_register_document_series_series_id_billing_series_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "cash_reg_doc_series_register_doctype_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "cash_reg_doc_series_series_idx";--> statement-breakpoint
ALTER TABLE "cash_register_document_series" ALTER COLUMN "series" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_series_id_cash_register_document_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."cash_register_document_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_reg_doc_series_register_receipt_type_idx" ON "cash_register_document_series" USING btree ("register_id","receipt_type_code");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_reg_doc_series_type_series_idx" ON "cash_register_document_series" USING btree ("receipt_type_code","series");--> statement-breakpoint
ALTER TABLE "cash_register_document_series" DROP COLUMN "document_type";--> statement-breakpoint
ALTER TABLE "cash_register_document_series" DROP COLUMN "series_id";