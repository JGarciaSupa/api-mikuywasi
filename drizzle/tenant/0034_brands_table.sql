-- Create brands table
CREATE TABLE "brands" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(20) NOT NULL,
	"logo" varchar(255),
	"primary_color" varchar(255) DEFAULT '#000000',
	"email" varchar(255),
	"category" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "brands_code_unique" UNIQUE("code")
);
--> statement-breakpoint

-- Migrate logo/color/email/category from tenant_configs into default brand
INSERT INTO "brands" ("name", "code", "logo", "primary_color", "email", "category", "is_active")
SELECT
	'Marca Principal',
	'MARCA-01',
	tc.logo,
	COALESCE(tc.primary_color, '#000000'),
	tc.email,
	tc.category,
	true
FROM "tenant_configs" tc
LIMIT 1;
--> statement-breakpoint

-- Fallback: if tenant_configs has no rows, insert a bare default
INSERT INTO "brands" ("name", "code", "is_active")
SELECT 'Marca Principal', 'MARCA-01', true
WHERE NOT EXISTS (SELECT 1 FROM "brands");
--> statement-breakpoint

-- Add brand_id to branches as nullable first (to allow data migration)
ALTER TABLE "branches" ADD COLUMN "brand_id" integer;
--> statement-breakpoint

-- Assign the default brand to all existing branches
UPDATE "branches" SET "brand_id" = (SELECT id FROM "brands" LIMIT 1);
--> statement-breakpoint

-- Make brand_id NOT NULL now that all rows have a value
ALTER TABLE "branches" ALTER COLUMN "brand_id" SET NOT NULL;
--> statement-breakpoint

-- FK constraint: restrict delete to prevent orphaned branches
ALTER TABLE "branches" ADD CONSTRAINT "branches_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint

-- Indexes
CREATE INDEX "brands_code_idx" ON "brands" USING btree ("code");
--> statement-breakpoint
CREATE INDEX "brands_active_idx" ON "brands" USING btree ("is_active");
--> statement-breakpoint
CREATE INDEX "branches_brand_idx" ON "branches" USING btree ("brand_id");
