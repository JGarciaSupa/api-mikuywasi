CREATE TABLE "exchange_rate" (
	"id" serial PRIMARY KEY NOT NULL,
	"date_exchange_rate" timestamp with time zone NOT NULL,
	"currency_from" varchar(3) NOT NULL,
	"currency_to" varchar(3) NOT NULL,
	"buy_exchange_rate" numeric(18, 6),
	"sell_exchange_rate" numeric(18, 6),
	"hotel_exchange_rate" numeric(18, 6),
	"official_exchange_rate" numeric(18, 6),
	"branch_id" integer,
	"user_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate" ADD CONSTRAINT "exchange_rate_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;