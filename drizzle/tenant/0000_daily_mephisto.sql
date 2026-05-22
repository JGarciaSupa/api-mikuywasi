CREATE TABLE "banners" (
	"id" serial PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_time" time,
	"end_time" time,
	"available_days" jsonb DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" varchar(12) NOT NULL,
	"product_id" integer,
	"product_name" varchar(150) NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"selected_alternatives" jsonb DEFAULT '[]'::jsonb,
	"packaging_fee" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"notes" varchar(100),
	"total_price" numeric(10, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" varchar(12) PRIMARY KEY NOT NULL,
	"customer_name" varchar(100) NOT NULL,
	"customer_phone" varchar(20),
	"customer_address" text,
	"delivery_info" jsonb,
	"delivery_type" text NOT NULL,
	"table_id" integer,
	"table_name" varchar(50),
	"payment_method" text NOT NULL,
	"notes" varchar(100),
	"subtotal" numeric(10, 2) NOT NULL,
	"delivery_fee" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"tracking_code" varchar(20),
	"driver_id" integer,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "orders_tracking_code_unique" UNIQUE("tracking_code")
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_id" integer,
	"name" varchar(150) NOT NULL,
	"description" text,
	"price" numeric(10, 2) NOT NULL,
	"discount_price" numeric(10, 2),
	"packaging_fee" numeric(10, 2) DEFAULT '0.00' NOT NULL,
	"image" text,
	"order" integer DEFAULT 0,
	"alternatives" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"token_hash" text NOT NULL,
	"user_agent" varchar(255),
	"ip_address" varchar(100),
	"expires_at" timestamp with time zone NOT NULL,
	"is_revoked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "social_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"platform" text NOT NULL,
	"url" text NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "restaurant_tables" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(50) NOT NULL,
	"slug" varchar(8) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "restaurant_tables_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tenant_configs" (
	"id" serial PRIMARY KEY NOT NULL,
	"logo" varchar(255),
	"primary_color" varchar(255) DEFAULT '#000000',
	"phone" varchar(255),
	"whatsapp" varchar(255),
	"email" varchar(255),
	"category" varchar(255),
	"address" jsonb,
	"delivery_zone" jsonb,
	"schedules" jsonb DEFAULT '[]'::jsonb,
	"has_delivery" boolean DEFAULT false NOT NULL,
	"has_pickup" boolean DEFAULT false NOT NULL,
	"has_dine_in" boolean DEFAULT false NOT NULL,
	"has_live_tracking" boolean DEFAULT false NOT NULL,
	"min_order_amount" numeric(10, 2) DEFAULT '0.00',
	"default_delivery_fee" numeric(10, 2) DEFAULT '0.00',
	"free_delivery_threshold" numeric(10, 2),
	"fiscal_id" varchar(255),
	"fiscal_name" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" varchar(255) NOT NULL,
	"name" varchar(255) NOT NULL,
	"image" text,
	"role" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_id_restaurant_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."restaurant_tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "products_category_id_idx" ON "products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens" USING btree ("user_id");