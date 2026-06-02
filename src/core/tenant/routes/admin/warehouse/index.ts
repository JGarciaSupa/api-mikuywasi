import { Hono } from 'hono';
import { authMiddleware, roleMiddleware } from '../../../middleware/auth.middleware';
import {
  validateCreatePurchaseDocument,
  validateCreateRequisition,
  validateCreateStockTransfer,
  validateCreateStockExit,
  validateCreatePortioning,
  validateOpenAdjustment,
  validateUpdateAdjustmentLines,
  validateCreateRecipe,
  validateCreateSalesDischarge,
  validateUpsertSetting,
} from '../../../validations/admin/warehouse/warehouse.validation';
import * as catalog from '../../../controllers/admin/warehouse/catalog.controller';
import * as movements from '../../../controllers/admin/warehouse/movements.controller';
import * as recipesLedger from '../../../controllers/admin/warehouse/recipes-ledger.controller';

const routes = new Hono();

routes.use('*', authMiddleware);
routes.use('/*', roleMiddleware(['admin']));

// ── Catálogo / Maestros ──────────────────────────────────────────────────────
routes.get('/families', catalog.listFamilies);
routes.post('/families', catalog.createFamily);
routes.put('/families/:id', catalog.updateFamily);

routes.get('/areas', catalog.listAreas);
routes.post('/areas', catalog.createArea);
routes.put('/areas/:id', catalog.updateArea);
routes.delete('/areas/:id', catalog.deleteArea);

routes.get('/suppliers', catalog.listSuppliers);
routes.get('/suppliers/:id', catalog.getSupplier);
routes.post('/suppliers', catalog.createSupplier);
routes.put('/suppliers/:id', catalog.updateSupplier);

routes.get('/measurement-units', catalog.listMeasurementUnits);
routes.post('/measurement-units', catalog.createMeasurementUnit);
routes.put('/measurement-units/:id', catalog.updateMeasurementUnit);

routes.get('/items', catalog.listItems);
routes.post('/items', catalog.createItem);
routes.get('/items/:id', catalog.getItem);
routes.put('/items/:id', catalog.updateItem);
routes.get('/areas/:areaId/items', catalog.listItemsByArea);
routes.post('/items/:itemId/areas', catalog.assignItemArea);
routes.delete('/items/:itemId/areas/:areaId', catalog.removeItemArea);

// ── Flujo 1 — Documentos de compra ───────────────────────────────────────────
routes.get('/purchase-documents', movements.listPurchaseDocuments);
routes.get('/purchase-documents/:id', movements.getPurchaseDocument);
routes.post('/purchase-documents', validateCreatePurchaseDocument, movements.createPurchaseDocument);
routes.put('/purchase-documents/:id', movements.updatePurchaseDocument);
routes.post('/purchase-documents/:id/process', movements.processPurchaseDocument);
routes.post('/purchase-documents/:id/void', movements.voidPurchaseDocument);

// ── Flujo 2 — Requerimientos ──────────────────────────────────────────────────
routes.get('/requisitions', movements.listRequisitions);
routes.get('/requisitions/:id', movements.getRequisition);
routes.post('/requisitions', validateCreateRequisition, movements.createRequisition);
routes.post('/requisitions/:id/process', movements.processRequisition);
routes.post('/requisitions/:id/void', movements.voidRequisition);

// ── Flujo 3 — Transferencias de stock ────────────────────────────────────────
routes.get('/stock-transfers', movements.listStockTransfers);
routes.get('/stock-transfers/:id', movements.getStockTransfer);
routes.post('/stock-transfers', validateCreateStockTransfer, movements.createStockTransfer);
routes.post('/stock-transfers/:id/process', movements.processStockTransfer);
routes.post('/stock-transfers/:id/void', movements.voidStockTransfer);

// ── Flujo 4 — Salidas de stock ───────────────────────────────────────────────
routes.get('/stock-exits', movements.listStockExits);
routes.get('/stock-exits/:id', movements.getStockExit);
routes.post('/stock-exits', validateCreateStockExit, movements.createStockExit);
routes.post('/stock-exits/:id/process', movements.processStockExit);
routes.post('/stock-exits/:id/void', movements.voidStockExit);

// ── Flujo 5 — Porcionamientos ────────────────────────────────────────────────
routes.get('/portionings', movements.listPortionings);
routes.get('/portionings/:id', movements.getPortioning);
routes.post('/portionings', validateCreatePortioning, movements.createPortioning);
routes.post('/portionings/:id/process', movements.processPortioning);
routes.post('/portionings/:id/void', movements.voidPortioning);

// ── Flujo 6 — Ajuste de inventarios ─────────────────────────────────────────
routes.get('/inventory-adjustments', movements.listAdjustments);
routes.get('/inventory-adjustments/:id', movements.getAdjustment);
routes.post('/inventory-adjustments/open', validateOpenAdjustment, movements.openAdjustment);
routes.patch('/inventory-adjustments/:id/lines', validateUpdateAdjustmentLines, movements.updateAdjustmentLines);
routes.post('/inventory-adjustments/:id/close', movements.closeAdjustment);

// ── Flujo 7 — Recetas ────────────────────────────────────────────────────────
routes.get('/recipes', recipesLedger.listRecipes);
routes.get('/recipes/:id', recipesLedger.getRecipe);
routes.get('/products/:productId/recipe', recipesLedger.getRecipeByProduct);
routes.post('/recipes', validateCreateRecipe, recipesLedger.createRecipe);
routes.put('/recipes/:id', recipesLedger.updateRecipe);

// ── Flujo 8 — Descarga de venta ──────────────────────────────────────────────
routes.get('/sales-discharge', recipesLedger.listSalesDischarges);
routes.get('/sales-discharge/preview/:orderId', recipesLedger.previewSalesDischarge);
routes.get('/sales-discharge/:id', recipesLedger.getSalesDischarge);
routes.post('/sales-discharge', validateCreateSalesDischarge, recipesLedger.createSalesDischarge);
routes.post('/sales-discharge/:id/process', recipesLedger.processSalesDischarge);

// ── Flujo 9 — Lotes ──────────────────────────────────────────────────────────
routes.get('/batches', recipesLedger.listBatches);
routes.post('/batches/refresh-statuses', recipesLedger.refreshBatches);

// ── Reportes y Kardex ────────────────────────────────────────────────────────
routes.get('/kardex/area/:areaId', recipesLedger.getKardex);
routes.get('/stock-snapshot', recipesLedger.getStockSnapshot);
routes.get('/waste-log', recipesLedger.listWaste);
routes.get('/items/:id/movements', recipesLedger.getItemMovements);


// ── Configuración del almacén ────────────────────────────────────────────────
routes.get('/settings', recipesLedger.listSettings);
routes.put('/settings/:key', validateUpsertSetting, recipesLedger.upsertSetting);

export default routes;
