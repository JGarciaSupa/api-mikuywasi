-- SIGG 2.6 (fase 2): Activación de canales por sucursal
-- Reemplaza los booleanos fijos has_dine_in/has_delivery/has_pickup de `branches`.
-- Aditivo y seguro: no borra columnas viejas, solo agrega y backfillea.

CREATE TABLE "branch_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint

ALTER TABLE "branch_channels" ADD CONSTRAINT "branch_channels_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "branch_channels" ADD CONSTRAINT "branch_channels_channel_id_sales_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."sales_channels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint

CREATE UNIQUE INDEX "branch_channels_unique_idx" ON "branch_channels" USING btree ("branch_id", "channel_id");
--> statement-breakpoint
CREATE INDEX "branch_channels_branch_idx" ON "branch_channels" USING btree ("branch_id");
--> statement-breakpoint
CREATE INDEX "branch_channels_channel_idx" ON "branch_channels" USING btree ("channel_id");
--> statement-breakpoint

-- Canales por defecto del catálogo (idempotente por código único, no duplica si el tenant
-- ya tiene canales propios creados a mano).
INSERT INTO "sales_channels" ("name", "code", "type", "is_active") VALUES
	('Salón', 'SALON', 'dine_in', true),
	('Delivery Propio', 'DELIVERY-PROPIO', 'delivery', true),
	('Recojo en Tienda', 'RECOJO-TIENDA', 'pickup', true)
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint

-- Backfill: las sucursales con el booleano viejo en true quedan con el canal equivalente activo.
INSERT INTO "branch_channels" ("branch_id", "channel_id")
SELECT b."id", sc."id" FROM "branches" b, "sales_channels" sc
WHERE sc."code" = 'SALON' AND b."has_dine_in" = true
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "branch_channels" ("branch_id", "channel_id")
SELECT b."id", sc."id" FROM "branches" b, "sales_channels" sc
WHERE sc."code" = 'DELIVERY-PROPIO' AND b."has_delivery" = true
ON CONFLICT DO NOTHING;
--> statement-breakpoint

INSERT INTO "branch_channels" ("branch_id", "channel_id")
SELECT b."id", sc."id" FROM "branches" b, "sales_channels" sc
WHERE sc."code" = 'RECOJO-TIENDA' AND b."has_pickup" = true
ON CONFLICT DO NOTHING;
