ALTER TABLE "branches" ADD COLUMN "sunat_anexo_code" varchar(10) DEFAULT '0000' NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "applies_tax_1" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "applies_tax_2" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "applies_tax_3" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "applies_icbper" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "base_currency" varchar(3) DEFAULT 'PEN' NOT NULL;--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "foreign_currency" varchar(3);