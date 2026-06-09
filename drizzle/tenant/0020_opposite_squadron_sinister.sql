ALTER TABLE "sales_discharge" ALTER COLUMN "area_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sales_discharge_lines" ADD COLUMN "area_id" integer;--> statement-breakpoint
ALTER TABLE "sales_discharge_lines" ADD CONSTRAINT "sales_discharge_lines_area_id_storage_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."storage_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_discharge_lines_area_idx" ON "sales_discharge_lines" USING btree ("area_id");