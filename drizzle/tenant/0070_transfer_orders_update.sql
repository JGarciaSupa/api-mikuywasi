ALTER TABLE "order_transfers" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "order_transfers" CASCADE;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transferred_session_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transferred_by_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "transferred_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_transferred_by_id_users_id_fk" FOREIGN KEY ("transferred_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_transferred_session_idx" ON "orders" USING btree ("transferred_session_id");