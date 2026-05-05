ALTER TABLE "users" DROP CONSTRAINT "role_tenant_check";--> statement-breakpoint
ALTER TABLE "order_items" ALTER COLUMN "notes" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "notes" SET DATA TYPE varchar(100);--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "role_tenant_check" CHECK (
    (role = 'super-admin' AND tenant_id IS NULL) OR
    (role IN ('admin', 'kitchen', 'waiter', 'delivery') AND tenant_id IS NOT NULL)
  );