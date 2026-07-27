ALTER TABLE "restaurant_tables" ADD COLUMN "pos_x" real;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD COLUMN "pos_y" real;--> statement-breakpoint
ALTER TABLE "restaurant_tables" ADD COLUMN "shape" varchar(10) DEFAULT 'square';