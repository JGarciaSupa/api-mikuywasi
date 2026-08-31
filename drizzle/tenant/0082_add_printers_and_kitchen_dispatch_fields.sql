CREATE TABLE IF NOT EXISTS "printers" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"name" varchar(100) NOT NULL,
	"connection_type" varchar(30) NOT NULL,
	"target" varchar(255) NOT NULL,
	"paper_columns" integer DEFAULT 48 NOT NULL,
	"enable_beep" boolean DEFAULT false NOT NULL,
	"cut_paper" boolean DEFAULT true NOT NULL,
	"open_drawer" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "kitchen_stations" ADD COLUMN IF NOT EXISTS "printer_id" integer;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "sent_to_kitchen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_items" ADD COLUMN IF NOT EXISTS "printed_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'printers_branch_id_branches_id_fk') THEN
    ALTER TABLE "printers" ADD CONSTRAINT "printers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printers_branch_idx" ON "printers" USING btree ("branch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "printers_active_idx" ON "printers" USING btree ("is_active");--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'kitchen_stations_printer_id_printers_id_fk') THEN
    ALTER TABLE "kitchen_stations" ADD CONSTRAINT "kitchen_stations_printer_id_printers_id_fk" FOREIGN KEY ("printer_id") REFERENCES "public"."printers"("id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kitchen_stations_printer_idx" ON "kitchen_stations" USING btree ("printer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "order_items_sent_to_kitchen_idx" ON "order_items" USING btree ("order_id","sent_to_kitchen");
