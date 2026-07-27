ALTER TABLE "identity_document_types" ALTER COLUMN "country_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_types" ALTER COLUMN "country_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_types" ADD COLUMN "is_global" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_document_types" DROP COLUMN "is_global";