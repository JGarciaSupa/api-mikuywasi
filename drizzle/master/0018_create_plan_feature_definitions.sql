CREATE TABLE IF NOT EXISTS "plan_feature_definitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"key" varchar(60) NOT NULL,
	"label" varchar(120) NOT NULL,
	"description" varchar(255),
	"value_type" varchar(10) NOT NULL,
	"unit" varchar(40),
	"default_value" jsonb,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "plan_feature_definitions_key_unique" UNIQUE("key")
);
--> statement-breakpoint
INSERT INTO "plan_feature_definitions" ("key", "label", "description", "value_type", "unit", "default_value", "display_order")
VALUES ('maxProducts', 'Máximo de productos', 'Cantidad máxima de productos que el restaurante puede crear o importar.', 'number', 'productos', '150'::jsonb, 1)
ON CONFLICT ("key") DO NOTHING;
