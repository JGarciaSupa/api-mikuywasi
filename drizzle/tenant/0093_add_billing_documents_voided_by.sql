ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "voided_by" varchar(100);
