CREATE TABLE "branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(20) NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"address" jsonb,
	"delivery_zone" jsonb,
	"schedules" jsonb DEFAULT '[]'::jsonb,
	"phone" varchar(30),
	"whatsapp" varchar(30),
	"email" varchar(150),
	"has_delivery" boolean DEFAULT false NOT NULL,
	"has_pickup" boolean DEFAULT false NOT NULL,
	"has_dine_in" boolean DEFAULT false NOT NULL,
	"has_live_tracking" boolean DEFAULT false NOT NULL,
	"min_order_amount" numeric(10, 2) DEFAULT '0.00',
	"default_delivery_fee" numeric(10, 2) DEFAULT '0.00',
	"free_delivery_threshold" numeric(10, 2),
	"fiscal_id" varchar(30),
	"fiscal_name" varchar(200),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "branches_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_branches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"branch_id" integer NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "branch_recipe_areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"product_id" integer NOT NULL,
	"area_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer,
	"name" varchar(100) NOT NULL,
	"code" varchar(20) NOT NULL,
	"is_central" boolean DEFAULT false NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "warehouses_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "storage_areas" DROP CONSTRAINT "storage_areas_name_unique";--> statement-breakpoint
ALTER TABLE "recipes" DROP CONSTRAINT "recipes_production_area_id_storage_areas_id_fk";
--> statement-breakpoint
DROP INDEX "recipes_area_idx";--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "social_links" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "area_ledger" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "main_ledger" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "main_ledger" ADD COLUMN "warehouse_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "portionings" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_price_history" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "requisitions" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_discharge" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_exits" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_snapshot" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "source_branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD COLUMN "target_branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "storage_areas" ADD COLUMN "warehouse_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "waste_log" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "user_roles" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "billing_series" ADD COLUMN "branch_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_recipe_areas" ADD CONSTRAINT "branch_recipe_areas_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_recipe_areas" ADD CONSTRAINT "branch_recipe_areas_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "branch_recipe_areas" ADD CONSTRAINT "branch_recipe_areas_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "branches_code_idx" ON "branches" USING btree ("code");--> statement-breakpoint
CREATE INDEX "branches_active_idx" ON "branches" USING btree ("is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "user_branches_unique_idx" ON "user_branches" USING btree ("user_id","branch_id");--> statement-breakpoint
CREATE INDEX "user_branches_user_idx" ON "user_branches" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_branches_branch_idx" ON "user_branches" USING btree ("branch_id");--> statement-breakpoint
CREATE UNIQUE INDEX "branch_recipe_areas_unique_idx" ON "branch_recipe_areas" USING btree ("branch_id","product_id");--> statement-breakpoint
CREATE INDEX "branch_recipe_areas_branch_idx" ON "branch_recipe_areas" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "branch_recipe_areas_product_idx" ON "branch_recipe_areas" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "warehouses_branch_idx" ON "warehouses" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "warehouses_code_idx" ON "warehouses" USING btree ("code");--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_links" ADD CONSTRAINT "social_links_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD CONSTRAINT "restaurant_tables_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_ledger" ADD CONSTRAINT "area_ledger_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_ledger" ADD CONSTRAINT "main_ledger_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "main_ledger" ADD CONSTRAINT "main_ledger_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "portionings" ADD CONSTRAINT "portionings_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_documents" ADD CONSTRAINT "purchase_documents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_price_history" ADD CONSTRAINT "purchase_price_history_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisitions" ADD CONSTRAINT "requisitions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_discharge" ADD CONSTRAINT "sales_discharge_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_exits" ADD CONSTRAINT "stock_exits_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_snapshot" ADD CONSTRAINT "stock_snapshot_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_source_branch_id_branches_id_fk" FOREIGN KEY ("source_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_target_branch_id_branches_id_fk" FOREIGN KEY ("target_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_areas" ADD CONSTRAINT "storage_areas_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_series" ADD CONSTRAINT "billing_series_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "banners_branch_idx" ON "banners" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "orders_branch_idx" ON "orders" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "orders_status_idx" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "payment_methods_branch_idx" ON "payment_methods" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "social_links_branch_idx" ON "social_links" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "restaurant_tables_branch_idx" ON "restaurant_tables" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "area_ledger_branch_idx" ON "area_ledger" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "cash_sessions_branch_idx" ON "cash_sessions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "inventory_adjustments_branch_idx" ON "inventory_adjustments" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "main_ledger_branch_idx" ON "main_ledger" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "main_ledger_warehouse_idx" ON "main_ledger" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "portionings_branch_idx" ON "portionings" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "purchase_docs_branch_idx" ON "purchase_documents" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "requisitions_branch_idx" ON "requisitions" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "sales_discharge_branch_idx" ON "sales_discharge" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "stock_exits_branch_idx" ON "stock_exits" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "stock_snapshot_branch_idx" ON "stock_snapshot" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "stock_transfers_source_branch_idx" ON "stock_transfers" USING btree ("source_branch_id");--> statement-breakpoint
CREATE INDEX "stock_transfers_target_branch_idx" ON "stock_transfers" USING btree ("target_branch_id");--> statement-breakpoint
CREATE INDEX "storage_areas_warehouse_idx" ON "storage_areas" USING btree ("warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_areas_name_warehouse_idx" ON "storage_areas" USING btree ("warehouse_id","name");--> statement-breakpoint
CREATE INDEX "waste_log_branch_idx" ON "waste_log" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "user_perm_overrides_branch_idx" ON "user_permission_overrides" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "user_roles_branch_idx" ON "user_roles" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "billing_docs_branch_idx" ON "billing_documents" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX "billing_series_branch_idx" ON "billing_series" USING btree ("branch_id");--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "phone";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "whatsapp";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "address";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "delivery_zone";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "schedules";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "has_delivery";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "has_pickup";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "has_dine_in";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "has_live_tracking";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "min_order_amount";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "default_delivery_fee";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "free_delivery_threshold";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "fiscal_id";--> statement-breakpoint
ALTER TABLE "tenant_configs" DROP COLUMN "fiscal_name";--> statement-breakpoint
ALTER TABLE "recipes" DROP COLUMN "production_area_id";--> statement-breakpoint
ALTER TABLE "storage_areas" DROP COLUMN "is_central";