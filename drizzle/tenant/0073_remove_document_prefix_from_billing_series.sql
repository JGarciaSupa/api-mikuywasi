DROP INDEX "billing_series_prefix_series_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "billing_series_type_series_idx" ON "billing_series" USING btree ("document_type","series");--> statement-breakpoint
ALTER TABLE "billing_series" DROP COLUMN "document_prefix";