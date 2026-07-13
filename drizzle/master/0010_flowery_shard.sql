ALTER TABLE "identity_document_types" ADD COLUMN "validation_type" varchar(20) DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "identity_document_types" ADD COLUMN "doc_length" integer;--> statement-breakpoint
ALTER TABLE "identity_document_types" ADD COLUMN "doc_pattern" varchar(100);