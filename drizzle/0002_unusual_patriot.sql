ALTER TABLE "order_item_sides" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "product_alternatives" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "product_sides" ADD COLUMN "tenant_id" integer;--> statement-breakpoint
ALTER TABLE "order_item_sides" ADD CONSTRAINT "order_item_sides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_alternatives" ADD CONSTRAINT "product_alternatives_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sides" ADD CONSTRAINT "product_sides_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "banners_tenant_id_idx" ON "banners" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "categories_tenant_id_idx" ON "categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "order_item_sides_tenant_id_idx" ON "order_item_sides" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "order_item_sides_order_item_id_idx" ON "order_item_sides" USING btree ("order_item_id");--> statement-breakpoint
CREATE INDEX "order_items_tenant_id_idx" ON "order_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "order_items_order_id_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_product_id_idx" ON "order_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "orders_tenant_id_idx" ON "orders" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_alternatives_tenant_id_idx" ON "product_alternatives" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_alternatives_product_id_idx" ON "product_alternatives" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_sides_tenant_id_idx" ON "product_sides" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_sides_product_id_idx" ON "product_sides" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_tenant_id_idx" ON "products" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "social_links_tenant_id_idx" ON "social_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tenants_plan_id_idx" ON "tenants" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "users_tenant_id_idx" ON "users" USING btree ("tenant_id");