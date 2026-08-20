ALTER TABLE "order_items" ADD COLUMN "prepared_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "prepared_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "prepared_by_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_prepared_by_id_users_id_fk" FOREIGN KEY ("prepared_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_prepared_idx" ON "order_items" USING btree ("order_id","prepared_qty");--> statement-breakpoint
-- Backfill: las líneas existentes heredan la fecha de su pedido, para que la marca
-- de "adición" no aparezca en todo lo que ya estaba en cola.
UPDATE "order_items" oi SET "created_at" = o."created_at" FROM "orders" o WHERE o."id" = oi."order_id";--> statement-breakpoint
-- Backfill: lo que ya salió de cocina queda marcado como preparado, para que un
-- recálculo posterior no lo devuelva a la cola.
UPDATE "order_items" oi SET "prepared_qty" = oi."quantity", "prepared_at" = o."updated_at" FROM "orders" o WHERE o."id" = oi."order_id" AND o."status" IN ('ready_for_pickup','dispatched','completed') AND oi."deleted_at" IS NULL;
