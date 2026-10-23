ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "allow_pending_payment" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "payment_pending" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "payment_pending_note" varchar(200);
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "payment_collected_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "payment_collected_by" varchar(100);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_documents_payment_pending_idx" ON "billing_documents" USING btree ("branch_id") WHERE "payment_pending" = true AND "payment_collected_at" IS NULL;
