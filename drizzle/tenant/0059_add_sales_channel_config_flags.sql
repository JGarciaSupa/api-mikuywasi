ALTER TABLE "sales_channels" ADD COLUMN "is_waiter_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD COLUMN "require_table" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD COLUMN "require_waiter" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD COLUMN "require_pax" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD COLUMN "require_customer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD COLUMN "require_delivery_address" boolean DEFAULT false NOT NULL;