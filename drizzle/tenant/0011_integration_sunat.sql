ALTER TABLE "branches" ADD COLUMN "facturador_empresa_id" integer;--> statement-breakpoint
ALTER TABLE "tenant_configs" ADD COLUMN "facturador_empresa_id" integer;--> statement-breakpoint
ALTER TABLE "tenant_configs" ADD COLUMN "facturador_ruc" varchar(20);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "sunat_status" varchar(20);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "sunat_code" varchar(10);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "sunat_message" text;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "xml_hash" varchar(100);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "xml_filename" varchar(60);--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "facturador_comprobante_id" integer;