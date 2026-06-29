ALTER TABLE "orders" ADD COLUMN "collected_session_id" integer;--> statement-breakpoint
CREATE INDEX "orders_collected_session_idx" ON "orders" USING btree ("collected_session_id");