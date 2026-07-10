-- Estación de cocina por defecto para los productos de una categoría/subcategoría (SIGG 2.7).
-- Aditivo y seguro: columna nullable, no afecta filas existentes.
ALTER TABLE "categories" ADD COLUMN "kitchen_station_id" integer REFERENCES "kitchen_stations"("id") ON DELETE SET NULL;
CREATE INDEX "categories_kitchen_station_idx" ON "categories" ("kitchen_station_id");
