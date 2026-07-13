ALTER TABLE "cash_sessions" ADD COLUMN "exchange_rate" numeric(8, 4) DEFAULT '1' NOT NULL;
ALTER TABLE "cash_registers" DROP COLUMN "exchange_rate";