ALTER TABLE "orders" ADD COLUMN "cash_session_id" integer;--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "exchange_rate" numeric(8, 4) DEFAULT '1' NOT NULL;--> statement-breakpoint
CREATE INDEX "orders_cash_session_idx" ON "orders" USING btree ("cash_session_id");--> statement-breakpoint
ALTER TABLE "cash_sessions" DROP COLUMN "exchange_rate";