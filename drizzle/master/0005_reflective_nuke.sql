CREATE TABLE "actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"icon" varchar(50),
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "actions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "base_role_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"base_role_id" integer NOT NULL,
	"sub_action_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "base_roles" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "base_roles_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sub_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"action_id" integer NOT NULL,
	"code" varchar(100) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255),
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sub_actions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "tenant_feature_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"sub_action_id" integer NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now(),
	"granted_by" integer
);
--> statement-breakpoint
CREATE TABLE "tenant_role_grants" (
	"id" serial PRIMARY KEY NOT NULL,
	"tenant_id" integer NOT NULL,
	"base_role_id" integer NOT NULL,
	"granted_at" timestamp with time zone DEFAULT now(),
	"granted_by" integer
);
--> statement-breakpoint
ALTER TABLE "base_role_permissions" ADD CONSTRAINT "base_role_permissions_base_role_id_base_roles_id_fk" FOREIGN KEY ("base_role_id") REFERENCES "public"."base_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "base_role_permissions" ADD CONSTRAINT "base_role_permissions_sub_action_id_sub_actions_id_fk" FOREIGN KEY ("sub_action_id") REFERENCES "public"."sub_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_actions" ADD CONSTRAINT "sub_actions_action_id_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_feature_grants" ADD CONSTRAINT "tenant_feature_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_feature_grants" ADD CONSTRAINT "tenant_feature_grants_sub_action_id_sub_actions_id_fk" FOREIGN KEY ("sub_action_id") REFERENCES "public"."sub_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_feature_grants" ADD CONSTRAINT "tenant_feature_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_role_grants" ADD CONSTRAINT "tenant_role_grants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_role_grants" ADD CONSTRAINT "tenant_role_grants_base_role_id_base_roles_id_fk" FOREIGN KEY ("base_role_id") REFERENCES "public"."base_roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_role_grants" ADD CONSTRAINT "tenant_role_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "base_role_perms_unique_idx" ON "base_role_permissions" USING btree ("base_role_id","sub_action_id");--> statement-breakpoint
CREATE INDEX "base_role_perms_role_idx" ON "base_role_permissions" USING btree ("base_role_id");--> statement-breakpoint
CREATE INDEX "sub_actions_action_idx" ON "sub_actions" USING btree ("action_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_feature_grants_unique_idx" ON "tenant_feature_grants" USING btree ("tenant_id","sub_action_id");--> statement-breakpoint
CREATE INDEX "tenant_feature_grants_tenant_idx" ON "tenant_feature_grants" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tenant_role_grants_unique_idx" ON "tenant_role_grants" USING btree ("tenant_id","base_role_id");--> statement-breakpoint
CREATE INDEX "tenant_role_grants_tenant_idx" ON "tenant_role_grants" USING btree ("tenant_id");