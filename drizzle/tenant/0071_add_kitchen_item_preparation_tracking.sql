ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "prepared_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "prepared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "prepared_by_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "order_items" ADD CONSTRAINT "order_items_prepared_by_id_users_id_fk" FOREIGN KEY ("prepared_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
