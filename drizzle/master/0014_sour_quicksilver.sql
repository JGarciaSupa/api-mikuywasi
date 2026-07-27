ALTER TABLE "identity_document_types" ALTER COLUMN "country_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_document_types" ADD COLUMN "is_global" boolean DEFAULT false NOT NULL;