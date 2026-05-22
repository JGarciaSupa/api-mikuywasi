CREATE TABLE "lobito_prueba" (
	"id" serial PRIMARY KEY NOT NULL,
	"nombre" varchar(100) NOT NULL,
	"edad" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
