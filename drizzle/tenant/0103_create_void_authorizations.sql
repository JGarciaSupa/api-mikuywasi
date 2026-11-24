CREATE TABLE IF NOT EXISTS "void_authorizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" varchar(20) NOT NULL,
	"order_id" varchar(12),
	"order_item_id" integer,
	"document_id" integer,
	"branch_id" integer NOT NULL,
	"summary" jsonb,
	"request_token_hash" varchar(64) NOT NULL,
	"requested_by_id" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"code_hash" varchar(64),
	"approved_by_id" integer,
	"approved_at" timestamp with time zone,
	"used_at" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'void_authorizations_order_id_orders_id_fk') THEN
    ALTER TABLE "void_authorizations" ADD CONSTRAINT "void_authorizations_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'void_authorizations_order_item_id_order_items_id_fk') THEN
    ALTER TABLE "void_authorizations" ADD CONSTRAINT "void_authorizations_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'void_authorizations_document_id_billing_documents_id_fk') THEN
    ALTER TABLE "void_authorizations" ADD CONSTRAINT "void_authorizations_document_id_billing_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."billing_documents"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'void_authorizations_branch_id_branches_id_fk') THEN
    ALTER TABLE "void_authorizations" ADD CONSTRAINT "void_authorizations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'void_authorizations_requested_by_id_users_id_fk') THEN
    ALTER TABLE "void_authorizations" ADD CONSTRAINT "void_authorizations_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'void_authorizations_approved_by_id_users_id_fk') THEN
    ALTER TABLE "void_authorizations" ADD CONSTRAINT "void_authorizations_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "void_authorizations_request_token_hash_idx" ON "void_authorizations" USING btree ("request_token_hash");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "void_authorizations_order_idx" ON "void_authorizations" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "void_authorizations_document_idx" ON "void_authorizations" USING btree ("document_id");
