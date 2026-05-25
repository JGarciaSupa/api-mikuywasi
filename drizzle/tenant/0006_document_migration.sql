CREATE TABLE "billing_document_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"product_id" integer,
	"product_name" varchar(150) NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"alternatives_desc" varchar(300),
	"packaging_fee" numeric(10, 2) DEFAULT '0' NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"notes" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "billing_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(12) NOT NULL,
	"series_id" integer NOT NULL,
	"document_type" varchar(20) NOT NULL,
	"series" varchar(10) NOT NULL,
	"sequential" integer NOT NULL,
	"document_number" varchar(20) NOT NULL,
	"buyer_doc_type" varchar(10),
	"buyer_doc_number" varchar(20),
	"buyer_name" varchar(200),
	"buyer_address" text,
	"buyer_email" varchar(150),
	"subtotal" numeric(12, 2) NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"tax_amount" numeric(12, 2) NOT NULL,
	"total" numeric(12, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'PEN' NOT NULL,
	"status" varchar(20) DEFAULT 'issued' NOT NULL,
	"notes" text,
	"issued_at" timestamp with time zone DEFAULT now(),
	"voided_at" timestamp with time zone,
	"voided_reason" text,
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "billing_documents_document_number_unique" UNIQUE("document_number")
);
--> statement-breakpoint
CREATE TABLE "billing_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_type" varchar(20) NOT NULL,
	"series" varchar(10) NOT NULL,
	"last_sequential" integer DEFAULT 0 NOT NULL,
	"price_incl_tax" boolean DEFAULT false NOT NULL,
	"tax_rate" numeric(5, 2) DEFAULT '18' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" varchar(200),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "billing_series_series_unique" UNIQUE("series")
);
--> statement-breakpoint
ALTER TABLE "billing_document_lines" ADD CONSTRAINT "billing_document_lines_document_id_billing_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."billing_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_document_lines" ADD CONSTRAINT "billing_document_lines_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_series_id_billing_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."billing_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_doc_lines_doc_idx" ON "billing_document_lines" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "billing_docs_order_idx" ON "billing_documents" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "billing_docs_status_idx" ON "billing_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "billing_docs_type_idx" ON "billing_documents" USING btree ("document_type");--> statement-breakpoint
CREATE INDEX "billing_docs_issued_at_idx" ON "billing_documents" USING btree ("issued_at");