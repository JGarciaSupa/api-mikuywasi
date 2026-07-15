ALTER TABLE "branches" ADD COLUMN IF NOT EXISTS "taxes" jsonb;
UPDATE "branches"
SET "taxes" = '[{"key":"impuesto_1","label":"Aplica Impuesto 1","rate":18,"defaultActive":true,"isActive":true},{"key":"impuesto_2","label":"Aplica Impuesto 2","rate":0,"defaultActive":false,"isActive":false},{"key":"impuesto_3","label":"Aplica Impuesto 3","rate":0,"defaultActive":false,"isActive":false},{"key":"icbper","label":"Aplica ICBPER","rate":0.5,"defaultActive":false,"isActive":false}]'::jsonb
WHERE "taxes" IS NULL;
ALTER TABLE "branches" ALTER COLUMN "taxes" SET DEFAULT '[{"key":"impuesto_1","label":"Aplica Impuesto 1","rate":18,"defaultActive":true,"isActive":true},{"key":"impuesto_2","label":"Aplica Impuesto 2","rate":0,"defaultActive":false,"isActive":false},{"key":"impuesto_3","label":"Aplica Impuesto 3","rate":0,"defaultActive":false,"isActive":false},{"key":"icbper","label":"Aplica ICBPER","rate":0.5,"defaultActive":false,"isActive":false}]'::jsonb;
ALTER TABLE "branches" ALTER COLUMN "taxes" SET NOT NULL;

ALTER TABLE "product_sales_channel_prices" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;
ALTER TABLE "product_sales_channel_prices" ADD COLUMN IF NOT EXISTS "taxes" jsonb;
