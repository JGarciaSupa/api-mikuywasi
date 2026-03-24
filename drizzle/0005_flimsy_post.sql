ALTER TABLE "banners" DROP CONSTRAINT "banners_tenant_id_tenants_id_fk";
--> statement-breakpoint
ALTER TABLE "banners" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "banners" ADD COLUMN "order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "social_links" ADD COLUMN "order" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "banners" ADD CONSTRAINT "banners_tenant_order_unique" UNIQUE("tenant_id","order");