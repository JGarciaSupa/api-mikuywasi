-- Tareas de despliegue (src/deploy-tasks): registro de las que ya corrieron en este entorno.
-- Cada tarea corre una sola vez por entorno al arrancar la API; si falla se reintenta en el siguiente arranque.
CREATE TABLE IF NOT EXISTS "deploy_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"status" varchar(20) NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"output" text,
	"started_at" timestamp with time zone DEFAULT now(),
	"finished_at" timestamp with time zone,
	CONSTRAINT "deploy_tasks_name_unique" UNIQUE("name")
);
