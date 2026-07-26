ALTER TABLE "branch_channels" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "branch_channels" CASCADE;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD COLUMN "branch_id" integer;--> statement-breakpoint
ALTER TABLE "sales_channels" ADD CONSTRAINT "sales_channels_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_channels_branch_idx" ON "sales_channels" USING btree ("branch_id");