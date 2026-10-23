CREATE TABLE IF NOT EXISTS "product_extra_group_category_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"category_id" integer NOT NULL,
	"include_subcategories" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_extra_group_category_links_group_id_product_extra_groups_id_fk') THEN
    ALTER TABLE "product_extra_group_category_links" ADD CONSTRAINT "product_extra_group_category_links_group_id_product_extra_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."product_extra_groups"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_extra_group_category_links_category_id_categories_id_fk') THEN
    ALTER TABLE "product_extra_group_category_links" ADD CONSTRAINT "product_extra_group_category_links_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "pegcl_group_category_unique_idx" ON "product_extra_group_category_links" USING btree ("group_id","category_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pegcl_category_idx" ON "product_extra_group_category_links" USING btree ("category_id");
