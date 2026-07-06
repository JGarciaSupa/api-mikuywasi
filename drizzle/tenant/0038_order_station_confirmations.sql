-- SIGG 2.7 (fix): confirmación de "listo" por estación, por pedido.
-- Tabla nueva, sin dependencias de datos existentes: no requiere backfill.

CREATE TABLE "order_station_confirmations" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(12) NOT NULL,
	"station_id" integer NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "order_station_confirmations" ADD CONSTRAINT "order_station_confirmations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "order_station_confirmations" ADD CONSTRAINT "order_station_confirmations_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "order_station_confirmations_unique_idx" ON "order_station_confirmations" USING btree ("order_id", "station_id");
--> statement-breakpoint
CREATE INDEX "order_station_confirmations_order_idx" ON "order_station_confirmations" USING btree ("order_id");
