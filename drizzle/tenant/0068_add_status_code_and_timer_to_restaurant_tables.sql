ALTER TABLE "restaurant_tables" ADD COLUMN "status_code" varchar(50) DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD COLUMN "status_updated_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD COLUMN "current_reservation_note" varchar(255);