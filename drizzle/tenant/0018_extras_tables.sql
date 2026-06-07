CREATE TABLE "order_item_extras" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_item_id" integer NOT NULL,
	"extra_id" integer NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_extra_group_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"group_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_extra_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_multiple" boolean DEFAULT true NOT NULL,
	"max_selections" integer,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "product_extras" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"source_type" varchar(20) NOT NULL,
	"item_id" integer,
	"item_qty" numeric(12, 3) DEFAULT '1' NOT NULL,
	"recipe_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "sales_discharge_lines" ALTER COLUMN "recipe_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "order_item_extras" ADD CONSTRAINT "order_item_extras_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_item_extras" ADD CONSTRAINT "order_item_extras_extra_id_product_extras_id_fk" FOREIGN KEY ("extra_id") REFERENCES "public"."product_extras"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_extra_group_assignments" ADD CONSTRAINT "product_extra_group_assignments_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_extra_group_assignments" ADD CONSTRAINT "product_extra_group_assignments_group_id_product_extra_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_extra_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_extras" ADD CONSTRAINT "product_extras_group_id_product_extra_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_extra_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_extras" ADD CONSTRAINT "product_extras_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_extras" ADD CONSTRAINT "product_extras_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oie_order_item_idx" ON "order_item_extras" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "oie_extra_idx" ON "order_item_extras" USING btree ("extra_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pega_product_group_unique_idx" ON "product_extra_group_assignments" USING btree ("product_id","group_id");--> statement-breakpoint
CREATE INDEX "pega_product_idx" ON "product_extra_group_assignments" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "pega_group_idx" ON "product_extra_group_assignments" USING btree ("group_id");