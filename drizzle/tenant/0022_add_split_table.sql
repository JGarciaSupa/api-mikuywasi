CREATE TABLE "order_splits" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(12) NOT NULL,
	"label" varchar(100) DEFAULT 'Cuenta' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"payment_method" text,
	"subtotal" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "split_id" integer;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD COLUMN "split_id" integer;--> statement-breakpoint
ALTER TABLE "order_splits" ADD CONSTRAINT "order_splits_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_splits_order_idx" ON "order_splits" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_split_id_order_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."order_splits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_documents" ADD CONSTRAINT "billing_documents_split_id_order_splits_id_fk" FOREIGN KEY ("split_id") REFERENCES "public"."order_splits"("id") ON DELETE no action ON UPDATE no action;