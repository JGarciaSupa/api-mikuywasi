-- SIGG US 1.5: "CRUD de Áreas de Producción... utilizadas por local" — las estaciones
-- de cocina pasan de catálogo único del tenant a fila propia por sucursal.

-- 1. kitchen_stations gana branch_id. Backfill: lo existente pertenecía operativamente
--    a la sucursal principal (única con pedidos activos hasta ahora).
ALTER TABLE "kitchen_stations" ADD COLUMN "branch_id" integer REFERENCES "branches"("id") ON DELETE CASCADE;
UPDATE "kitchen_stations" SET "branch_id" = (SELECT "id" FROM "branches" WHERE "is_main" = true LIMIT 1);
ALTER TABLE "kitchen_stations" ALTER COLUMN "branch_id" SET NOT NULL;

ALTER TABLE "kitchen_stations" DROP CONSTRAINT "kitchen_stations_code_unique";
DROP INDEX "kitchen_stations_code_idx";
CREATE UNIQUE INDEX "kitchen_stations_branch_code_unique_idx" ON "kitchen_stations" ("branch_id", "code");
CREATE INDEX "kitchen_stations_branch_idx" ON "kitchen_stations" ("branch_id");

-- 2. product_kitchen_stations: de station_id (FK fijo a una sola sucursal) a
--    station_code (se resuelve dentro de la sucursal del pedido en curso).
ALTER TABLE "product_kitchen_stations" ADD COLUMN "station_code" varchar(30);
UPDATE "product_kitchen_stations" pks
  SET "station_code" = ks."code"
  FROM "kitchen_stations" ks
  WHERE ks."id" = pks."station_id";
DELETE FROM "product_kitchen_stations" WHERE "station_code" IS NULL;
ALTER TABLE "product_kitchen_stations" ALTER COLUMN "station_code" SET NOT NULL;

ALTER TABLE "product_kitchen_stations" DROP CONSTRAINT "product_kitchen_stations_station_id_kitchen_stations_id_fk";
DROP INDEX "product_kitchen_stations_unique_idx";
DROP INDEX "product_kitchen_stations_station_idx";
ALTER TABLE "product_kitchen_stations" DROP COLUMN "station_id";
CREATE UNIQUE INDEX "product_kitchen_stations_unique_idx" ON "product_kitchen_stations" ("product_id", "station_code");

-- 3. categories: de kitchen_station_id (FK fijo) a kitchen_station_code.
ALTER TABLE "categories" ADD COLUMN "kitchen_station_code" varchar(30);
UPDATE "categories" c
  SET "kitchen_station_code" = ks."code"
  FROM "kitchen_stations" ks
  WHERE ks."id" = c."kitchen_station_id";
ALTER TABLE "categories" DROP CONSTRAINT "categories_kitchen_station_id_fkey";
DROP INDEX "categories_kitchen_station_idx";
ALTER TABLE "categories" DROP COLUMN "kitchen_station_id";
