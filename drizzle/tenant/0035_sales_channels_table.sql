-- SIGG 2.6: Catálogo Maestro de Canales de Venta
-- Tabla nueva, sin dependencias de datos existentes: no requiere backfill.

CREATE TABLE "sales_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(30) NOT NULL,
	"type" varchar(20) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sales_channels_code_unique" UNIQUE("code")
);
--> statement-breakpoint

CREATE INDEX "sales_channels_code_idx" ON "sales_channels" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "sales_channels_active_idx" ON "sales_channels" USING btree ("is_active");
