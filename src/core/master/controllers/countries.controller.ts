import type { Context } from 'hono';
import * as countriesService from '../services/countries.service';

export const getAllCountriesController = async (c: Context) => {
  try {
    const includeInactive = c.req.query('all') === 'true';
    const result = await countriesService.getAllCountries(includeInactive);
    return c.json({ success: true, message: 'Países obtenidos con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al obtener países', data: null }, 500);
  }
};

export const getCountryByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await countriesService.getCountryById(id);
    return c.json({ success: true, message: 'País obtenido con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'País no encontrado', data: null }, 404);
  }
};

export const createCountryController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await countriesService.createCountry(data);
    return c.json({ success: true, message: 'País creado con éxito', data: result }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al crear el país', data: null }, 400);
  }
};

export const updateCountryController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const data = c.req.valid('json' as never);
    const result = await countriesService.updateCountry(id, data);
    return c.json({ success: true, message: 'País actualizado con éxito', data: result });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al actualizar el país', data: null }, 400);
  }
};

export const deleteCountryController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await countriesService.deleteCountry(id);
    return c.json({ success: true, message: result.message, data: null });
  } catch (error: any) {
    return c.json({ success: false, message: error.message || 'Error al eliminar el país', data: null }, 400);
  }
};
