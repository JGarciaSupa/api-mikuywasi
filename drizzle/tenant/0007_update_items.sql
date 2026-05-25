-- ── Measurement units catalog (nueva tabla) ──────────────────
CREATE TABLE IF NOT EXISTS "measurement_units" (
  "id" serial PRIMARY KEY NOT NULL,
  "code" varchar(30) NOT NULL,
  "name" varchar(100) NOT NULL,
  "dimension" varchar(50) NOT NULL,
  "base_factor" numeric(14, 6),
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone,
  CONSTRAINT "measurement_units_code_unique" UNIQUE("code")
);
--> statement-breakpoint

-- ── Eliminar item_subfamilies si todavía existe ───────────────
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_subfamily_id_item_subfamilies_id_fk";
--> statement-breakpoint
ALTER TABLE "waste_log" DROP CONSTRAINT IF EXISTS "waste_log_subfamily_id_item_subfamilies_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "items_subfamily_idx";
--> statement-breakpoint
DROP TABLE IF EXISTS "item_subfamilies" CASCADE;
--> statement-breakpoint

-- ── Ajustar defaults de items ─────────────────────────────────
ALTER TABLE "items" ALTER COLUMN "ledger_unit" SET DEFAULT '';
--> statement-breakpoint
ALTER TABLE "items" ALTER COLUMN "cost_unit" SET DEFAULT '';
--> statement-breakpoint

-- ── Añadir family_id si no existe ────────────────────────────
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "family_id" integer;
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_family_id_item_families_id_fk";
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_family_id_item_families_id_fk"
  FOREIGN KEY ("family_id") REFERENCES "item_families"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
DROP INDEX IF EXISTS "items_family_idx";
--> statement-breakpoint
CREATE INDEX "items_family_idx" ON "items" USING btree ("family_id");
--> statement-breakpoint

-- ── Añadir columnas FK de unidades de medida ─────────────────
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "ledger_unit_id" integer;
--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "cost_unit_id" integer;
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_ledger_unit_id_measurement_units_id_fk";
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_ledger_unit_id_measurement_units_id_fk"
  FOREIGN KEY ("ledger_unit_id") REFERENCES "measurement_units"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT IF EXISTS "items_cost_unit_id_measurement_units_id_fk";
--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_cost_unit_id_measurement_units_id_fk"
  FOREIGN KEY ("cost_unit_id") REFERENCES "measurement_units"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint

-- ── Eliminar columnas obsoletas si todavía existen ───────────
ALTER TABLE "items" DROP COLUMN IF EXISTS "full_description";
--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN IF EXISTS "subfamily_id";
--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN IF EXISTS "item_type";
--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN IF EXISTS "max_stock";
--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN IF EXISTS "target_stock";
--> statement-breakpoint
ALTER TABLE "waste_log" DROP COLUMN IF EXISTS "subfamily_id";
--> statement-breakpoint
