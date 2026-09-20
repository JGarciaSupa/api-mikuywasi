import { Context } from 'hono';
import { safeMessage } from '@/utils/errors';
import * as printerService from '../../../services/admin/config-local/printer.service';

export async function listPrintersController(c: Context) {
  try {
    const branchIdStr = c.req.query('branchId');
    if (!branchIdStr) {
      return c.json({ success: false, message: 'branchId es requerido' }, 400);
    }
    const branchId = Number(branchIdStr);
    const data = await printerService.listPrinters(branchId);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al listar impresoras') }, 500);
  }
}

export async function getPrinterByIdController(c: Context) {
  try {
    const id = Number(c.req.param('id'));
    const data = await printerService.getPrinterById(id);
    if (!data) return c.json({ success: false, message: 'Impresora no encontrada' }, 404);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al obtener impresora') }, 500);
  }
}

export async function createPrinterController(c: Context) {
  try {
    const body = await c.req.valid('json' as never);
    const data = await printerService.createPrinter(body);
    return c.json({ success: true, message: 'Impresora creada exitosamente', data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al crear impresora') }, 400);
  }
}

export async function updatePrinterController(c: Context) {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.valid('json' as never);
    const data = await printerService.updatePrinter(id, body);
    if (!data) return c.json({ success: false, message: 'Impresora no encontrada' }, 404);
    return c.json({ success: true, message: 'Impresora actualizada exitosamente', data });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al actualizar impresora') }, 400);
  }
}

export async function deletePrinterController(c: Context) {
  try {
    const id = Number(c.req.param('id'));
    const data = await printerService.deletePrinter(id);
    if (!data) return c.json({ success: false, message: 'Impresora no encontrada' }, 404);
    return c.json({ success: true, message: 'Impresora eliminada exitosamente' });
  } catch (error: any) {
    return c.json({ success: false, message: safeMessage(error, 'Error al eliminar impresora') }, 500);
  }
}
