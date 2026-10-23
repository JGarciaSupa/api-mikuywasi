import type { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import { importTables } from '../../../services/admin/config-local/tables-import.service';
import type { TableImportInput } from '../../../validations/admin/config-local/tables-import.validation';

export const importTablesController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never) as TableImportInput;
    const result = await importTables(data);
    return c.json({
      success: true,
      message: `Importación finalizada: ${result.created} creadas, ${result.skipped} omitidas, ${result.failed} con error`,
      data: result,
    });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al importar las mesas') }, 400);
  }
};
