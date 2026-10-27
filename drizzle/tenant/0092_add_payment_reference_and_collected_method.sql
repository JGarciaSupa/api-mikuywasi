ALTER TABLE "order_payments" ADD COLUMN IF NOT EXISTS "reference" varchar(50);
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "payment_collected_method_id" integer REFERENCES "payment_methods"("id");
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "payment_collected_method" varchar(100);
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "payment_collected_reference" varchar(50);
--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "pending_payment_requires_customer" boolean DEFAULT false NOT NULL;
