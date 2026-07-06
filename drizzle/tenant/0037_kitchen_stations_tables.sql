-- SIGG 2.7: Estaciones de Cocina y Ruteo de Productos
-- Tablas nuevas, sin dependencias de datos existentes: no requiere backfill.

CREATE TABLE "kitchen_stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(30) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "kitchen_stations_code_unique" UNIQUE("code")
);
--> statement-breakpoint

CREATE TABLE "product_kitchen_stations" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"station_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "product_kitchen_stations" ADD CONSTRAINT "product_kitchen_stations_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "product_kitchen_stations" ADD CONSTRAINT "product_kitchen_stations_station_id_kitchen_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."kitchen_stations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE INDEX "kitchen_stations_code_idx" ON "kitchen_stations" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "kitchen_stations_active_idx" ON "kitchen_stations" USING btree ("is_active");
--> statement-breakpoint
CREATE UNIQUE INDEX "product_kitchen_stations_unique_idx" ON "product_kitchen_stations" USING btree ("product_id", "station_id");
--> statement-breakpoint
CREATE INDEX "product_kitchen_stations_product_idx" ON "product_kitchen_stations" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX "product_kitchen_stations_station_idx" ON "product_kitchen_stations" USING btree ("station_id");
