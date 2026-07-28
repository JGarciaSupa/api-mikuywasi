CREATE TABLE "table_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"color_hex" varchar(20) NOT NULL,
	"bg_color_class" varchar(50) NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"is_operational" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "table_statuses_code_unique" UNIQUE("code")
);
