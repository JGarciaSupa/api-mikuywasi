CREATE TABLE "orders_items_deleted" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(12) NOT NULL,
	"order_item_id" integer NOT NULL,
	"reason_id" integer,
	"motivo" varchar(200),
	"deleted_by_id" integer,
	"authorized_by_id" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "motivo" varchar(200);--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "reason_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deleted_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "deleted_by_id" integer;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "authorized_by_id" integer;--> statement-breakpoint
ALTER TABLE "orders_items_deleted" ADD CONSTRAINT "orders_items_deleted_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_items_deleted" ADD CONSTRAINT "orders_items_deleted_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_items_deleted" ADD CONSTRAINT "orders_items_deleted_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders_items_deleted" ADD CONSTRAINT "orders_items_deleted_authorized_by_id_users_id_fk" FOREIGN KEY ("authorized_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_items_deleted_order_idx" ON "orders_items_deleted" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_items_deleted_item_idx" ON "orders_items_deleted" USING btree ("order_item_id");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_deleted_by_id_users_id_fk" FOREIGN KEY ("deleted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_authorized_by_id_users_id_fk" FOREIGN KEY ("authorized_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;