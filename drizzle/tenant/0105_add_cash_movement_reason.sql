ALTER TABLE "cash_movements" ADD COLUMN IF NOT EXISTS "reason_id" integer;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_movements_reason_id_reasons_id_fk') THEN
    ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_reason_id_reasons_id_fk" FOREIGN KEY ("reason_id") REFERENCES "public"."reasons"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_movements_reason_idx" ON "cash_movements" USING btree ("reason_id");
