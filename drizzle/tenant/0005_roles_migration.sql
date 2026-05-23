CREATE TABLE "cash_movements" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"movement_type" varchar(20) NOT NULL,
	"concept" varchar(200) NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_method" varchar(100),
	"order_id" varchar(12),
	"reference" varchar(100),
	"created_by" varchar(100),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "cash_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(30) NOT NULL,
	"opened_by" varchar(100) NOT NULL,
	"closed_by" varchar(100),
	"opening_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"closing_balance" numeric(12, 2),
	"total_income" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_expense" numeric(12, 2) DEFAULT '0' NOT NULL,
	"expected_balance" numeric(12, 2) DEFAULT '0' NOT NULL,
	"difference" numeric(12, 2),
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"notes" varchar(300),
	"opened_at" timestamp with time zone DEFAULT now(),
	"closed_at" timestamp with time zone,
	CONSTRAINT "cash_sessions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "permissions_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_sub_action_id" integer NOT NULL,
	"action_code" varchar(50) NOT NULL,
	"action_name" varchar(100) NOT NULL,
	"sub_action_code" varchar(100) NOT NULL,
	"sub_action_name" varchar(100) NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "permissions_catalog_master_sub_action_id_unique" UNIQUE("master_sub_action_id")
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role_id" integer NOT NULL,
	"perm_catalog_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"master_role_id" integer,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_custom" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_permission_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"perm_catalog_id" integer NOT NULL,
	"type" varchar(10) DEFAULT 'grant' NOT NULL,
	"granted_by" integer,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"role_id" integer NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now(),
	"assigned_by" integer,
	CONSTRAINT "user_roles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_session_id_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."cash_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_perm_catalog_id_permissions_catalog_id_fk" FOREIGN KEY ("perm_catalog_id") REFERENCES "public"."permissions_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_perm_catalog_id_permissions_catalog_id_fk" FOREIGN KEY ("perm_catalog_id") REFERENCES "public"."permissions_catalog"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_permission_overrides" ADD CONSTRAINT "user_permission_overrides_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_movements_session_idx" ON "cash_movements" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "cash_movements_type_idx" ON "cash_movements" USING btree ("movement_type");--> statement-breakpoint
CREATE INDEX "cash_movements_order_idx" ON "cash_movements" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "cash_sessions_status_idx" ON "cash_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "cash_sessions_opened_at_idx" ON "cash_sessions" USING btree ("opened_at");--> statement-breakpoint
CREATE INDEX "perm_catalog_action_idx" ON "permissions_catalog" USING btree ("action_code");--> statement-breakpoint
CREATE UNIQUE INDEX "role_permissions_unique_idx" ON "role_permissions" USING btree ("role_id","perm_catalog_id");--> statement-breakpoint
CREATE INDEX "role_permissions_role_idx" ON "role_permissions" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_perm_overrides_unique_idx" ON "user_permission_overrides" USING btree ("user_id","perm_catalog_id");--> statement-breakpoint
CREATE INDEX "user_perm_overrides_user_idx" ON "user_permission_overrides" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");