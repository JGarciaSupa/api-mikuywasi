ALTER TABLE "users" DROP CONSTRAINT "role_tenant_check";--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_tenant_check" CHECK (
    (role = 'super-admin' AND tenant_id IS NULL) OR
    (role != 'super-admin' AND tenant_id IS NOT NULL)
  );