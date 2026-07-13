CREATE TABLE "branch_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "kitchen_stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(30) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_station_confirmations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(12) NOT NULL,
	"station_id" integer NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_kitchen_stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"station_code" varchar(30) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sales_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(30) NOT NULL,
	"type" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sales_channels_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "cash_register_document_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"register_id" integer NOT NULL,
	"document_type" varchar(20) NOT NULL,
	"series_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "billing_documents" ALTER COLUMN "buyer_doc_type" SET DATA TYPE varchar(20);--> statement-breakpoint
ALTER TABLE "branches" ADD COLUMN "sunat_anexo" varchar(4);--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "kitchen_station_code" varchar(30);--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "exchange_rate" numeric(8, 4) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "sunat_anexo" varchar(4);--> statement-breakpoint
ALTER TABLE "branch_channels" ADD CONSTRAINT "branch_channels_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_channels" ADD CONSTRAINT "branch_channels_channel_id_sales_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_station_confirmations" ADD CONSTRAINT "order_station_confirmations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_station_confirmations" ADD CONSTRAINT "order_station_confirmations_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_kitchen_stations" ADD CONSTRAINT "product_kitchen_stations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_register_document_series" ADD CONSTRAINT "cash_register_document_series_register_id_cash_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_register_document_series" ADD CONSTRAINT "cash_register_document_series_series_id_billing_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."billing_series"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "branch_channels_unique_idx" ON "branch_channels" USING btree ("branch_id","channel_id");--> statement-breakpoint
CREATE INDEX "branch_channels_branch_idx" ON "branch_channels" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "branch_channels_channel_idx" ON "branch_channels" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kitchen_stations_branch_code_unique_idx" ON "kitchen_stations" USING btree ("branch_id","code");--> statement-breakpoint
CREATE INDEX "kitchen_stations_branch_idx" ON "kitchen_stations" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "kitchen_stations_active_idx" ON "kitchen_stations" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "order_station_confirmations_unique_idx" ON "order_station_confirmations" USING btree ("order_id","station_id");--> statement-breakpoint
CREATE INDEX "order_station_confirmations_order_idx" ON "order_station_confirmations" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_kitchen_stations_unique_idx" ON "product_kitchen_stations" USING btree ("product_id","station_code");--> statement-breakpoint
CREATE INDEX "product_kitchen_stations_product_idx" ON "product_kitchen_stations" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sales_channels_code_idx" ON "sales_channels" USING btree ("code");--> statement-breakpoint
CREATE INDEX "sales_channels_active_idx" ON "sales_channels" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_reg_doc_series_register_doctype_idx" ON "cash_register_document_series" USING btree ("register_id","document_type");--> statement-breakpoint
CREATE INDEX "cash_reg_doc_series_register_idx" ON "cash_register_document_series" USING btree ("register_id");--> statement-breakpoint
ALTER TABLE "cash_sessions" DROP COLUMN "exchange_rate";