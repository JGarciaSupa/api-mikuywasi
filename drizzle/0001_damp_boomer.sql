ALTER TABLE "plans" ADD COLUMN "monthly_price" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" ADD COLUMN "yearly_price" numeric(10, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "price";--> statement-breakpoint
ALTER TABLE "plans" DROP COLUMN "old_price";