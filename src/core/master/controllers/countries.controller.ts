import type { Context } from 'hono';
import * as CountriesService from '../services/countries.service';

export const getCountries = async (c: Context) => {
  try {
    const data = await CountriesService.getCountries();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const getCountryById = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await CountriesService.getCountryById(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 404);
  }
};

export const createCountry = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await CountriesService.createCountry(body);
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const updateCountry = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const data = await CountriesService.updateCountry(id, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const deleteCountry = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await CountriesService.deleteCountry(id);
    return c.json({ success: true, ...data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};
