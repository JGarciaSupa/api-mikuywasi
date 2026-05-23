CREATE TABLE "adjustment_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"adjustment_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"closing_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"final_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"adjustment" numeric(12, 3) DEFAULT '0' NOT NULL,
	"avg_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"adjustment_value" numeric(12, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "area_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now(),
	"document_type" varchar(50),
	"document_number" varchar(30),
	"origin_dest" varchar(100),
	"entry_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"exit_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"entry_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"entry_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"exit_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"current_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"avg_price" numeric(12, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"table_name" varchar(100) NOT NULL,
	"operation" varchar(20) NOT NULL,
	"record_id" integer,
	"before_data" jsonb,
	"after_data" jsonb,
	"user_id" integer,
	"user_name" varchar(100),
	"module" varchar(100),
	"description" varchar(300),
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"document_id" integer,
	"batch_number" varchar(50),
	"initial_qty" numeric(12, 3) NOT NULL,
	"current_qty" numeric(12, 3) NOT NULL,
	"entry_date" date DEFAULT CURRENT_DATE NOT NULL,
	"expiry_date" date,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "inventory_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"area_id" integer NOT NULL,
	"date" date DEFAULT CURRENT_DATE NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone,
	CONSTRAINT "inventory_adjustments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "item_area_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_families" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "item_families_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "item_subfamilies" (
	"id" serial PRIMARY KEY NOT NULL,
	"family_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"full_description" varchar(200) NOT NULL,
	"short_description" varchar(100) NOT NULL,
	"subfamily_id" integer NOT NULL,
	"item_type" varchar(50) DEFAULT 'goods' NOT NULL,
	"ledger_unit" varchar(30) NOT NULL,
	"cost_unit" varchar(30) NOT NULL,
	"conversion_factor" numeric(12, 4) DEFAULT '1' NOT NULL,
	"min_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"max_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"target_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"current_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"expiry_days" integer DEFAULT 0 NOT NULL,
	"market_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"avg_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"transfer_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"cost_value" numeric(12, 4) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"daily_control" boolean DEFAULT true NOT NULL,
	"portionable" boolean DEFAULT false NOT NULL,
	"use_market_price" boolean DEFAULT false NOT NULL,
	"recipe_discharge" boolean DEFAULT false NOT NULL,
	"print_criteria" varchar(100),
	"external_code" varchar(50),
	"tax_code" varchar(30),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	"updated_by" varchar(100),
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "main_ledger" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now(),
	"document_type" varchar(50),
	"document_number" varchar(30),
	"origin_dest" varchar(100),
	"entry_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"exit_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"entry_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"exit_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"entry_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"exit_value" numeric(12, 2) DEFAULT '0' NOT NULL,
	"current_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"avg_price" numeric(12, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "portioning_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"portioning_id" integer NOT NULL,
	"target_item_id" integer NOT NULL,
	"equivalent" numeric(12, 3) NOT NULL,
	"portion_count" numeric(12, 3) NOT NULL,
	"total_weight" numeric(12, 3),
	"unit_price" numeric(12, 4),
	"ledger_unit" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "portionings" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" timestamp with time zone DEFAULT now(),
	"area_id" integer NOT NULL,
	"source_item_id" integer NOT NULL,
	"input_qty" numeric(12, 3) NOT NULL,
	"output_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"waste" numeric(12, 3) DEFAULT '0' NOT NULL,
	"waste_pct" numeric(6, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_document_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"unit_price" numeric(12, 4) NOT NULL,
	"line_total" numeric(12, 2) NOT NULL,
	"tax_pct" numeric(5, 2) DEFAULT '18' NOT NULL,
	"tax_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"other_charges" numeric(12, 2) DEFAULT '0' NOT NULL,
	"notes" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "purchase_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_type" varchar(30) NOT NULL,
	"series" varchar(10) NOT NULL,
	"sequential" varchar(20) NOT NULL,
	"supplier_id" integer NOT NULL,
	"issue_date" date NOT NULL,
	"entry_date" date DEFAULT CURRENT_DATE NOT NULL,
	"payment_date" date,
	"area_id" integer NOT NULL,
	"entry_type" varchar(30) DEFAULT 'goods' NOT NULL,
	"tax_operation" varchar(20) DEFAULT 'taxed' NOT NULL,
	"currency" varchar(10) DEFAULT 'PEN' NOT NULL,
	"exchange_rate" numeric(8, 4) DEFAULT '1' NOT NULL,
	"notes" varchar(200),
	"reference" varchar(100),
	"subtotal" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total" numeric(12, 2) DEFAULT '0' NOT NULL,
	"rounding" numeric(8, 4) DEFAULT '0' NOT NULL,
	"total_discount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"internal_number" varchar(30),
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "purchase_price_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"supplier_id" integer NOT NULL,
	"document_id" integer NOT NULL,
	"purchase_price" numeric(12, 4) NOT NULL,
	"qty" numeric(12, 3) NOT NULL,
	"purchase_date" date NOT NULL,
	"currency" varchar(10) DEFAULT 'PEN' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"qty" numeric(12, 4) NOT NULL,
	"unit" varchar(30) NOT NULL,
	"is_cost" boolean DEFAULT false NOT NULL,
	"is_optional" boolean DEFAULT false NOT NULL,
	"notes" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"name" varchar(200) NOT NULL,
	"servings" numeric(8, 3) DEFAULT '1' NOT NULL,
	"yield_pct" numeric(6, 2) DEFAULT '100' NOT NULL,
	"production_area_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "requisition_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"requisition_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"requested_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"served_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"pending_qty" numeric(12, 3) DEFAULT '0' NOT NULL,
	"reference_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"ledger_unit" varchar(30),
	"cost_unit" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "requisitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"attended_at" timestamp with time zone,
	"area_id" integer NOT NULL,
	"area_manager" varchar(100),
	"reference" varchar(100),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(100),
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sales_discharge" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(12) NOT NULL,
	"area_id" integer NOT NULL,
	"date" timestamp with time zone DEFAULT now(),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"total_cost" numeric(12, 4) DEFAULT '0' NOT NULL,
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone,
	CONSTRAINT "sales_discharge_order_id_unique" UNIQUE("order_id")
);
--> statement-breakpoint
CREATE TABLE "sales_discharge_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"discharge_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"recipe_id" integer NOT NULL,
	"qty" numeric(12, 4) NOT NULL,
	"unit" varchar(30),
	"avg_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"line_cost" numeric(12, 4) DEFAULT '0' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_exit_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"exit_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"exit_qty" numeric(12, 3) NOT NULL,
	"cost_qty" numeric(12, 3),
	"cost_value" numeric(12, 4),
	"ledger_unit" varchar(30),
	"cost_unit" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "stock_exits" (
	"id" serial PRIMARY KEY NOT NULL,
	"area_id" integer NOT NULL,
	"exit_type" varchar(30) DEFAULT 'consumption' NOT NULL,
	"concept" varchar(100),
	"reason" varchar(200),
	"destination_area_id" integer,
	"date" timestamp with time zone DEFAULT now(),
	"attendant" varchar(100),
	"process" varchar(100),
	"op_reference" varchar(50),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now(),
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stock_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"current_stock" numeric(12, 3) DEFAULT '0' NOT NULL,
	"avg_price" numeric(12, 4) DEFAULT '0' NOT NULL,
	"total_value" numeric(14, 2) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"transfer_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"ledger_qty" numeric(12, 3) NOT NULL,
	"cost_qty" numeric(12, 3),
	"ledger_unit" varchar(30),
	"cost_unit" varchar(30)
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"source_area_id" integer NOT NULL,
	"target_area_id" integer NOT NULL,
	"requisition_id" integer,
	"reference" varchar(100),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" varchar(100),
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "storage_areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(50) DEFAULT 'ambient' NOT NULL,
	"is_central" boolean DEFAULT false NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "storage_areas_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_id" varchar(20),
	"legal_name" varchar(200) NOT NULL,
	"trade_name" varchar(200),
	"contact_person" varchar(100),
	"phone" varchar(30) DEFAULT '-' NOT NULL,
	"email" varchar(150) DEFAULT '-' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone,
	CONSTRAINT "suppliers_tax_id_unique" UNIQUE("tax_id")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"description" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now(),
	"user_id" integer
);
--> statement-breakpoint
CREATE TABLE "waste_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"portioning_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"area_id" integer NOT NULL,
	"family_id" integer NOT NULL,
	"subfamily_id" integer NOT NULL,
	"date" date NOT NULL,
	"used_qty" numeric(12, 3) NOT NULL,
	"waste" numeric(12, 3) NOT NULL,
	"waste_value" numeric(12, 4) NOT NULL,
	"waste_pct" numeric(6, 2) NOT NULL,
	"unit" varchar(30)
);
--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "email" TO "username";--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_email_unique";--> statement-breakpoint
ALTER TABLE "adjustment_lines" ADD CONSTRAINT "adjustment_lines_adjustment_id_inventory_adjustments_id_fk" FOREIGN KEY ("adjustment_id") REFERENCES "public"."inventory_adjustments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustment_lines" ADD CONSTRAINT "adjustment_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_ledger" ADD CONSTRAINT "area_ledger_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_ledger" ADD CONSTRAINT "area_ledger_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_document_id_purchase_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_area_assignments" ADD CONSTRAINT "item_area_assignments_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_area_assignments" ADD CONSTRAINT "item_area_assignments_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_subfamilies" ADD CONSTRAINT "item_subfamilies_family_id_item_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."item_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_subfamily_id_item_subfamilies_id_fk" FOREIGN KEY ("subfamily_id") REFERENCES "public"."item_subfamilies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_ledger" ADD CONSTRAINT "main_ledger_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_ledger" ADD CONSTRAINT "main_ledger_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portioning_lines" ADD CONSTRAINT "portioning_lines_portioning_id_portionings_id_fk" FOREIGN KEY ("portioning_id") REFERENCES "public"."portionings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portioning_lines" ADD CONSTRAINT "portioning_lines_target_item_id_items_id_fk" FOREIGN KEY ("target_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portionings" ADD CONSTRAINT "portionings_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portionings" ADD CONSTRAINT "portionings_source_item_id_items_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_document_id_purchase_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_document_lines" ADD CONSTRAINT "purchase_document_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_price_history" ADD CONSTRAINT "purchase_price_history_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_price_history" ADD CONSTRAINT "purchase_price_history_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_price_history" ADD CONSTRAINT "purchase_price_history_document_id_purchase_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."purchase_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_lines" ADD CONSTRAINT "recipe_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_production_area_id_storage_areas_id_fk" FOREIGN KEY ("production_area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_lines" ADD CONSTRAINT "requisition_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_discharge" ADD CONSTRAINT "sales_discharge_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_discharge" ADD CONSTRAINT "sales_discharge_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_discharge_lines" ADD CONSTRAINT "sales_discharge_lines_discharge_id_sales_discharge_id_fk" FOREIGN KEY ("discharge_id") REFERENCES "public"."sales_discharge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_discharge_lines" ADD CONSTRAINT "sales_discharge_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_discharge_lines" ADD CONSTRAINT "sales_discharge_lines_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_exit_lines" ADD CONSTRAINT "stock_exit_lines_exit_id_stock_exits_id_fk" FOREIGN KEY ("exit_id") REFERENCES "public"."stock_exits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_exit_lines" ADD CONSTRAINT "stock_exit_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_exits" ADD CONSTRAINT "stock_exits_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_exits" ADD CONSTRAINT "stock_exits_destination_area_id_storage_areas_id_fk" FOREIGN KEY ("destination_area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshot" ADD CONSTRAINT "stock_snapshot_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshot" ADD CONSTRAINT "stock_snapshot_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_area_id_storage_areas_id_fk" FOREIGN KEY ("source_area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_target_area_id_storage_areas_id_fk" FOREIGN KEY ("target_area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_requisition_id_requisitions_id_fk" FOREIGN KEY ("requisition_id") REFERENCES "public"."requisitions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_portioning_id_portionings_id_fk" FOREIGN KEY ("portioning_id") REFERENCES "public"."portionings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_family_id_item_families_id_fk" FOREIGN KEY ("family_id") REFERENCES "public"."item_families"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_subfamily_id_item_subfamilies_id_fk" FOREIGN KEY ("subfamily_id") REFERENCES "public"."item_subfamilies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "area_ledger_item_idx" ON "area_ledger" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "area_ledger_area_idx" ON "area_ledger" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "area_ledger_date_idx" ON "area_ledger" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "audit_log_table_idx" ON "audit_log" USING btree ("table_name");--> statement-breakpoint
CREATE INDEX "audit_log_date_idx" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_log_user_idx" ON "audit_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_log_module_idx" ON "audit_log" USING btree ("module");--> statement-breakpoint
CREATE INDEX "audit_log_record_idx" ON "audit_log" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "batches_item_idx" ON "batches" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "batches_area_idx" ON "batches" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "batches_status_idx" ON "batches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "batches_expiry_idx" ON "batches" USING btree ("expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "item_area_assignments_unique_idx" ON "item_area_assignments" USING btree ("item_id","area_id");--> statement-breakpoint
CREATE UNIQUE INDEX "item_subfamilies_family_name_idx" ON "item_subfamilies" USING btree ("family_id","name");--> statement-breakpoint
CREATE INDEX "items_subfamily_idx" ON "items" USING btree ("subfamily_id");--> statement-breakpoint
CREATE INDEX "items_code_idx" ON "items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "items_active_idx" ON "items" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "main_ledger_item_idx" ON "main_ledger" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "main_ledger_area_idx" ON "main_ledger" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "main_ledger_date_idx" ON "main_ledger" USING btree ("recorded_at");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_docs_series_seq_supplier_idx" ON "purchase_documents" USING btree ("series","sequential","supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_docs_supplier_idx" ON "purchase_documents" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchase_docs_area_idx" ON "purchase_documents" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "purchase_docs_status_idx" ON "purchase_documents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "purchase_docs_date_idx" ON "purchase_documents" USING btree ("entry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_lines_recipe_item_idx" ON "recipe_lines" USING btree ("recipe_id","item_id");--> statement-breakpoint
CREATE INDEX "recipe_lines_recipe_idx" ON "recipe_lines" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_lines_item_idx" ON "recipe_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "recipes_product_idx" ON "recipes" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "recipes_area_idx" ON "recipes" USING btree ("production_area_id");--> statement-breakpoint
CREATE INDEX "requisitions_area_idx" ON "requisitions" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "requisitions_status_idx" ON "requisitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requisitions_date_idx" ON "requisitions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "sales_discharge_order_idx" ON "sales_discharge" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sales_discharge_area_idx" ON "sales_discharge" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "sales_discharge_status_idx" ON "sales_discharge" USING btree ("status");--> statement-breakpoint
CREATE INDEX "sales_discharge_lines_discharge_idx" ON "sales_discharge_lines" USING btree ("discharge_id");--> statement-breakpoint
CREATE INDEX "sales_discharge_lines_item_idx" ON "sales_discharge_lines" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stock_exits_area_idx" ON "stock_exits" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "stock_exits_date_idx" ON "stock_exits" USING btree ("date");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_snapshot_item_area_idx" ON "stock_snapshot" USING btree ("item_id","area_id");--> statement-breakpoint
CREATE INDEX "stock_snapshot_area_idx" ON "stock_snapshot" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "stock_snapshot_item_idx" ON "stock_snapshot" USING btree ("item_id");--> statement-breakpoint
CREATE INDEX "stock_transfers_source_idx" ON "stock_transfers" USING btree ("source_area_id");--> statement-breakpoint
CREATE INDEX "stock_transfers_target_idx" ON "stock_transfers" USING btree ("target_area_id");--> statement-breakpoint
CREATE INDEX "stock_transfers_status_idx" ON "stock_transfers" USING btree ("status");--> statement-breakpoint
CREATE INDEX "waste_log_date_idx" ON "waste_log" USING btree ("date");--> statement-breakpoint
CREATE INDEX "waste_log_area_idx" ON "waste_log" USING btree ("area_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");