CREATE TABLE "register_activations" (
	"id" serial PRIMARY KEY NOT NULL,
	"register_id" integer NOT NULL,
	"activation_code" varchar(80) NOT NULL,
	"is_enabled" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "register_activations" ADD CONSTRAINT "register_activations_register_id_cash_registers_id_fk" FOREIGN KEY ("register_id") REFERENCES "public"."cash_registers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "register_activations_reg_code_idx" ON "register_activations" USING btree ("register_id","activation_code");