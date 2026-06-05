CREATE TABLE "item_subcategories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "item_families" RENAME TO "item_categories";--> statement-breakpoint
ALTER TABLE "item_categories" DROP CONSTRAINT "item_families_name_unique";--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_family_id_item_families_id_fk";
--> statement-breakpoint
ALTER TABLE "waste_log" DROP CONSTRAINT "waste_log_family_id_item_families_id_fk";
--> statement-breakpoint
DROP INDEX "items_family_idx";--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "subcategory_id" integer;--> statement-breakpoint
ALTER TABLE "waste_log" ADD COLUMN "subcategory_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "item_subcategories" ADD CONSTRAINT "item_subcategories_category_id_item_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."item_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "item_subcategories_category_name_idx" ON "item_subcategories" USING btree ("category_id","name");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_subcategory_id_item_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."item_subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waste_log" ADD CONSTRAINT "waste_log_subcategory_id_item_subcategories_id_fk" FOREIGN KEY ("subcategory_id") REFERENCES "public"."item_subcategories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "items_subcategory_idx" ON "items" USING btree ("subcategory_id");--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "waste_log" DROP COLUMN "family_id";--> statement-breakpoint
ALTER TABLE "item_categories" ADD CONSTRAINT "item_categories_name_unique" UNIQUE("name");