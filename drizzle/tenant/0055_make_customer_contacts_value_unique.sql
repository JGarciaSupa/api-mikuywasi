DROP INDEX "customer_contacts_value_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "customer_contacts_value_idx" ON "customer_contacts" USING btree ("value");