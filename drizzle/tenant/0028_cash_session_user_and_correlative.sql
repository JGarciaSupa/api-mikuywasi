CREATE TABLE "cash_session_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"branch_id" integer NOT NULL,
	"year" integer NOT NULL,
	"last_sequence" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cash_sessions" DROP CONSTRAINT "cash_sessions_code_unique";--> statement-breakpoint
ALTER TABLE "cash_registers" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "user_id" integer;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "year" integer;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "sequence" integer;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD COLUMN "exchange_rate" numeric(8, 4) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "cash_session_sequences" ADD CONSTRAINT "cash_session_sequences_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_session_sequences_branch_year_idx" ON "cash_session_sequences" USING btree ("branch_id","year");--> statement-breakpoint
ALTER TABLE "cash_registers" ADD CONSTRAINT "cash_registers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_sessions" ADD CONSTRAINT "cash_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_registers_user_idx" ON "cash_registers" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_branch_code_idx" ON "cash_sessions" USING btree ("branch_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_sessions_branch_year_seq_idx" ON "cash_sessions" USING btree ("branch_id","year","sequence");--> statement-breakpoint
CREATE INDEX "cash_sessions_user_idx" ON "cash_sessions" USING btree ("user_id");