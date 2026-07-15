CREATE TABLE "product_sales_channel_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"sales_channel_id" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"discount_price" numeric(10, 2),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "product_sales_channel_prices" ADD CONSTRAINT "product_sales_channel_prices_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_sales_channel_prices" ADD CONSTRAINT "product_sales_channel_prices_sales_channel_id_sales_channels_id_fk" FOREIGN KEY ("sales_channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_sales_channel_prices_unique_idx" ON "product_sales_channel_prices" USING btree ("product_id","sales_channel_id");--> statement-breakpoint
CREATE INDEX "product_sales_channel_prices_product_idx" ON "product_sales_channel_prices" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_sales_channel_prices_channel_idx" ON "product_sales_channel_prices" USING btree ("sales_channel_id");