ALTER TABLE "cash_sessions" ADD COLUMN "opening_balance_foreign" numeric(12, 2) DEFAULT '0' NOT NULL;
ALTER TABLE "exchange_rate" ALTER COLUMN "date_exchange_rate" SET DATA TYPE date;