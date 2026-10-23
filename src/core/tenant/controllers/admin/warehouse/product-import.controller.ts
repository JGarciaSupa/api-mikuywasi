import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import { getAuditActor } from '@/utils/helpers';
import { writeAuditLog } from '../../../services/admin/warehouse/shared/audit.service';
import { parseIdParam } from '@/utils/helpers';
import {
  importProducts,
  setProductImage,
  IMPORT_IMAGE_MAX_BYTES,
  IMPORT_IMAGE_TYPES,
} from '../../../services/admin/warehouse/product-import.service';
import { getProductCapacity } from '../../../services/admin/warehouse/product-limit.service';
import type { ProductImportInput } from '../../../validations/admin/warehouse/product-import.validation';

export const importProductsController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never) as ProductImportInput;
    const result = await importProducts(data);

    // Auditoría propia con un resumen: evita que auditMiddleware guarde el lote completo.
    try {
      const actor = getAuditActor(c);
      await writeAuditLog({
        tableName: 'products',
        operation: 'INSERT',
        recordId: null,
        afterData: {
          branchId: data.branchId,
          total: result.total,
          created: result.created,
          skipped: result.skipped,
          failed: result.failed,
          createdCategories: result.createdCategories,
          createdAreas: result.createdAreas,
        },
        userId: actor.userId ?? null,
        module: 'productos',
        description: `Importación masiva de productos (${result.created} creados de ${result.total})`,
        ipAddress: actor.ip ?? null,
      });
      c.set('auditLogged', true);
    } catch (auditError) {
      console.error('Error al registrar auditoría de importación de productos:', auditError);
    }

    return c.json({
      success: true,
      message: `Importación finalizada: ${result.created} creados, ${result.skipped} omitidos, ${result.failed} con error`,
      data: result,
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: safeMessage(error, 'Error al importar los productos'),
    }, 400);
  }
};

export const getProductImportCapacityController = async (c: Context) => {
  try {
    const data = await getProductCapacity();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({
      success: false,
      message: safeMessage(error, 'Error al obtener la capacidad de productos'),
    }, 500);
  }
};

export const uploadImportedProductImageController = async (c: Context) => {
  try {
    const id = parseIdParam(c);
    const body = await c.req.parseBody();
    const file = body['image'];

    if (!(file instanceof File) || file.size === 0) {
      return c.json({ success: false, message: 'La imagen es requerida' }, 400);
    }
    if (!IMPORT_IMAGE_TYPES.includes(file.type)) {
      return c.json({ success: false, message: 'Formato no permitido (use JPG, PNG o WEBP)' }, 400);
    }
    if (file.size > IMPORT_IMAGE_MAX_BYTES) {
      return c.json({ success: false, message: 'La imagen supera el máximo de 5 MB' }, 400);
    }

    const data = await setProductImage(id, file);
    return c.json({ success: true, message: 'Imagen asignada con éxito', data });
  } catch (error: any) {
    return c.json({
      success: false,
      message: safeMessage(error, 'Error al subir la imagen del producto'),
    }, 400);
  }
};
