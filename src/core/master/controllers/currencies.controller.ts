import type { Context } from 'hono';
import * as currenciesService from '../services/currencies.service';

export const getAllCurrenciesController = async (c: Context) => {
  try {
    const result = await currenciesService.getAllCurrencies();
    return c.json({ success: true, message: 'Monedas obtenidas con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener monedas', data: null }, 500);
  }
};

export const getCurrencyByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await currenciesService.getCurrencyById(id);
    return c.json({ success: true, message: 'Moneda obtenida con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Moneda no encontrada', data: null }, 404);
  }
};

export const createCurrencyController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await currenciesService.createCurrency(data);
    return c.json({ success: true, message: 'Moneda creada con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear la moneda', data: null }, 400);
  }
};

export const updateCurrencyController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await currenciesService.updateCurrency(id, data);
    return c.json({ success: true, message: 'Moneda actualizada con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar la moneda', data: null }, 400);
  }
};

export const deleteCurrencyController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await currenciesService.deleteCurrency(id);
    return c.json({ success: true, message: result.message || 'Moneda eliminada correctamente', data: null });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar la moneda', data: null }, 400);
  }
};
