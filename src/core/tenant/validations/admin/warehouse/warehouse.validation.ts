import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const documentLineSchema = z.object({
  itemId: z.number().int(),
  qty: z.union([z.string(), z.number()]),
  unitPrice: z.union([z.string(), z.number()]),
  lineTotal: z.union([z.string(), z.number()]),
  taxPct: z.union([z.string(), z.number()]).optional(),
  taxAmount: z.union([z.string(), z.number()]).optional(),
  discount: z.union([z.string(), z.number()]).optional(),
  otherCharges: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional(),
});

export const createPurchaseDocumentSchema = z.object({
  documentType: z.enum(['invoice', 'receipt', 'delivery_note']),
  series: z.string().min(1),
  sequential: z.string().min(1),
  supplierId: z.number().int(),
  issueDate: z.string(),
  entryDate: z.string().optional(),
  paymentDate: z.string().optional().nullable(),
  areaId: z.number().int(),
  entryType: z.enum(['goods', 'service', 'fixed_asset']).optional(),
  taxOperation: z.enum(['taxed', 'exempt', 'unaffected']).optional(),
  currency: z.string().optional(),
  exchangeRate: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional(),
  reference: z.string().optional(),
  rounding: z.union([z.string(), z.number()]).optional(),
  totalDiscount: z.union([z.string(), z.number()]).optional(),
  internalNumber: z.string().optional(),
  createdBy: z.string().optional(),
  lines: z.array(documentLineSchema).min(1, 'Debe incluir al menos una línea'),
});

export const createRequisitionSchema = z.object({
  areaId: z.number().int(),
  areaManager: z.string().optional(),
  reference: z.string().optional(),
  createdBy: z.string().optional(),
  lines: z.array(z.object({
    itemId: z.number().int(),
    requestedQty: z.number().positive(),
    servedQty: z.number().nonnegative().optional(),
  })).min(1),
});

export const createStockTransferSchema = z.object({
  sourceAreaId: z.number().int(),
  targetAreaId: z.number().int(),
  requisitionId: z.number().int().optional(),
  reference: z.string().optional(),
  createdBy: z.string().optional(),
  lines: z.array(z.object({
    itemId: z.number().int(),
    ledgerQty: z.number().positive(),
    costQty: z.number().optional(),
  })).min(1),
});

export const createStockExitSchema = z.object({
  areaId: z.number().int(),
  exitType: z.enum([
    'consumption', 'write_off', 'quality_control', 'kitchen_test',
    'invoice_transfer', 'fruit_cleaning', 'expense', 'customer_return',
  ]).optional(),
  concept: z.string().optional(),
  reason: z.string().optional(),
  destinationAreaId: z.number().int().optional().nullable(),
  attendant: z.string().optional(),
  process: z.string().optional(),
  opReference: z.string().optional(),
  createdBy: z.string().optional(),
  lines: z.array(z.object({
    itemId: z.number().int(),
    exitQty: z.number().positive(),
    costQty: z.number().optional(),
    costValue: z.number().optional(),
  })).min(1),
});

export const createPortioningSchema = z.object({
  areaId: z.number().int(),
  sourceItemId: z.number().int(),
  inputQty: z.number().positive(),
  createdBy: z.string().optional(),
  lines: z.array(z.object({
    targetItemId: z.number().int(),
    equivalent: z.number().positive(),
    portionCount: z.number().positive(),
    unitPrice: z.number().optional(),
  })).min(1),
});

export const openAdjustmentSchema = z.object({
  areaId: z.number().int(),
  code: z.string().min(1),
  createdBy: z.string().optional(),
});

export const updateAdjustmentLinesSchema = z.object({
  lines: z.array(z.object({
    id: z.number().int(),
    finalStock: z.number().nonnegative(),
  })),
});

export const createRecipeSchema = z.object({
  productId: z.number().int(),
  name: z.string().min(1),
  servings: z.union([z.string(), z.number()]).optional(),
  yieldPct: z.union([z.string(), z.number()]).optional(),
  productionAreaId: z.number().int().optional(),
  isActive: z.boolean().optional(),
  lines: z.array(z.object({
    itemId: z.number().int(),
    qty: z.number().positive(),
    unit: z.string().min(1),
    isCost: z.boolean().optional(),
    isOptional: z.boolean().optional(),
    notes: z.string().optional(),
  })),
});

export const createSalesDischargeSchema = z.object({
  orderId: z.string().min(1),
  areaId: z.number().int(),
});

export const upsertSettingSchema = z.object({
  value: z.string(),
});

export const validateCreatePurchaseDocument = zValidator('json', createPurchaseDocumentSchema);
export const validateCreateRequisition = zValidator('json', createRequisitionSchema);
export const validateCreateStockTransfer = zValidator('json', createStockTransferSchema);
export const validateCreateStockExit = zValidator('json', createStockExitSchema);
export const validateCreatePortioning = zValidator('json', createPortioningSchema);
export const validateOpenAdjustment = zValidator('json', openAdjustmentSchema);
export const validateUpdateAdjustmentLines = zValidator('json', updateAdjustmentLinesSchema);
export const validateCreateRecipe = zValidator('json', createRecipeSchema);
export const validateCreateSalesDischarge = zValidator('json', createSalesDischargeSchema);
export const validateUpsertSetting = zValidator('json', upsertSettingSchema);
