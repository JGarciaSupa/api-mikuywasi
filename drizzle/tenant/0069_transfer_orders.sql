CREATE TABLE "order_transfers" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(12) NOT NULL,
	"session_id" integer NOT NULL,
	"transferred_by_id" integer,
	"transferred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"returned_at" timestamp with time zone,
	"returned_by_id" integer
);
--> statement-breakpoint
ALTER TABLE "order_transfers" ADD CONSTRAINT "order_transfers_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_transfers" ADD CONSTRAINT "order_transfers_transferred_by_id_users_id_fk" FOREIGN KEY ("transferred_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_transfers" ADD CONSTRAINT "order_transfers_returned_by_id_users_id_fk" FOREIGN KEY ("returned_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_transfers_order_idx" ON "order_transfers" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_transfers_session_idx" ON "order_transfers" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "order_transfers_active_idx" ON "order_transfers" USING btree ("order_id") WHERE "order_transfers"."returned_at" IS NULL;