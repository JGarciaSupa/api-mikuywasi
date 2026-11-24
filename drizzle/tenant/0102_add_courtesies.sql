ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "is_courtesy" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "courtesy_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "courtesy_reason_id" integer;
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "courtesy_motivo" varchar(200);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "courtesy_by_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "courtesy_authorized_by_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "courtesy_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "is_courtesy" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "courtesy_amount" numeric(10, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "courtesy_reason_id" integer;
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "courtesy_motivo" varchar(200);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "courtesy_by_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "courtesy_authorized_by_id" integer REFERENCES "users"("id");
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "courtesy_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "courtesy_amount" numeric(12, 2) DEFAULT '0.00' NOT NULL;
--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN IF NOT EXISTS "courtesy_motivo" varchar(200);
