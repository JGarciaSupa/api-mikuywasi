CREATE TABLE "identity_document_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "receipt_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"country_id" integer NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "name" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "countries" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "currencies" ALTER COLUMN "name" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "currencies" ALTER COLUMN "symbol" SET DATA TYPE varchar(5);--> statement-breakpoint
ALTER TABLE "currencies" ALTER COLUMN "is_active" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "identity_document_types" ADD CONSTRAINT "identity_document_types_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_types" ADD CONSTRAINT "receipt_types_country_id_countries_id_fk" FOREIGN KEY ("country_id") REFERENCES "public"."countries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idt_unique_code_country" ON "identity_document_types" USING btree ("country_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "rt_unique_code_country" ON "receipt_types" USING btree ("country_id","code");--> statement-breakpoint
ALTER TABLE "countries" DROP COLUMN "dial_code";