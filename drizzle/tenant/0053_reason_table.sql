CREATE TABLE "reasons" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"description" varchar(50) NOT NULL,
	"long_description" varchar(150),
	"max_amount" numeric(12, 2),
	"is_free_transfer" boolean DEFAULT false NOT NULL,
	"discount_mode" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "reasons" ADD CONSTRAINT "reasons_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reasons_branch_type_idx" ON "reasons" USING btree ("branch_id","type");