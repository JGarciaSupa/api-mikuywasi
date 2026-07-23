CREATE TABLE IF NOT EXISTS "sales_channel_classifications" (
	"code" varchar(50) PRIMARY KEY NOT NULL,
	"group" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
