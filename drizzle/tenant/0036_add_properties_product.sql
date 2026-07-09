CREATE TABLE "order_item_properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"property_id" integer NOT NULL,
	"property_name" varchar(100) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_properties" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_property_group_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"group_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_property_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"brand_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_multiple" boolean DEFAULT false NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "order_item_properties" ADD CONSTRAINT "order_item_properties_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_properties" ADD CONSTRAINT "order_item_properties_property_id_product_properties_id_fk" FOREIGN KEY ("property_id") REFERENCES "public"."product_properties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_properties" ADD CONSTRAINT "product_properties_group_id_product_property_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_property_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_property_group_assignments" ADD CONSTRAINT "product_property_group_assignments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_property_group_assignments" ADD CONSTRAINT "product_property_group_assignments_group_id_product_property_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_property_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_property_groups" ADD CONSTRAINT "product_property_groups_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oip_order_item_idx" ON "order_item_properties" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "oip_property_idx" ON "order_item_properties" USING btree ("property_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ppga_product_group_unique_idx" ON "product_property_group_assignments" USING btree ("product_id","group_id");--> statement-breakpoint
CREATE INDEX "ppga_product_idx" ON "product_property_group_assignments" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "ppga_group_idx" ON "product_property_group_assignments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "ppg_brand_idx" ON "product_property_groups" USING btree ("brand_id");