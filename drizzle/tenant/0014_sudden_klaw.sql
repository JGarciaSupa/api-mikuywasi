ALTER TABLE "recipes" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "produced_item_id" integer;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "type" varchar(30) DEFAULT 'sales' NOT NULL;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "preparation" text;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_produced_item_id_items_id_fk" FOREIGN KEY ("produced_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipes_produced_item_idx" ON "recipes" USING btree ("produced_item_id");