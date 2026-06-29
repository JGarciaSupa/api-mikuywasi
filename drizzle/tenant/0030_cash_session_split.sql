ALTER TABLE "order_splits" ADD COLUMN "payment_method_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "payment_method_id" integer;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD COLUMN "is_cash" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "is_cash" boolean;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD COLUMN "split_id" integer;--> statement-breakpoint
ALTER TABLE "order_splits" ADD CONSTRAINT "order_splits_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_split_id_order_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."order_splits"("id") ON DELETE no action ON UPDATE no action;