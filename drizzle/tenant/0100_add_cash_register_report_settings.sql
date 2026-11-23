ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "report_printer_id" integer REFERENCES "printers"("id") ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN IF NOT EXISTS "report_emails" jsonb DEFAULT '[]'::jsonb NOT NULL;
