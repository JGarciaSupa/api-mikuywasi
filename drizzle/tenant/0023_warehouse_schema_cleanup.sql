-- Migration 0023: Remove redundant/denormalized columns from items
-- ledger_unit / cost_unit  → use JOIN with measurement_units via ledger_unit_id / cost_unit_id
-- current_stock            → use SUM(stock_snapshot.current_stock) grouped by item
ALTER TABLE "items" DROP COLUMN "ledger_unit";
ALTER TABLE "items" DROP COLUMN "cost_unit";
ALTER TABLE "items" DROP COLUMN "current_stock";
