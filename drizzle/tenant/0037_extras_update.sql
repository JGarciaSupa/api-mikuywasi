ALTER TABLE "order_item_properties" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_properties" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_property_group_assignments" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "product_property_groups" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "order_item_properties" CASCADE;--> statement-breakpoint
DROP TABLE "product_properties" CASCADE;--> statement-breakpoint
DROP TABLE "product_property_group_assignments" CASCADE;--> statement-breakpoint
DROP TABLE "product_property_groups" CASCADE;--> statement-breakpoint
ALTER TABLE "product_extra_group_assignments" ADD COLUMN "extra_ids" jsonb DEFAULT 'null'::jsonb;--> statement-breakpoint
ALTER TABLE "product_extra_groups" ADD COLUMN "brand_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "product_extra_groups" ADD CONSTRAINT "product_extra_groups_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "peg_brand_idx" ON "product_extra_groups" USING btree ("brand_id");