import type { Context } from 'hono';
import * as ActivationsService from '../services/activations.service';

export const getActivations = async (c: Context) => {
  try {
    const data = await ActivationsService.getActivations();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const getActivationById = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await ActivationsService.getActivationById(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 404);
  }
};

export const createActivation = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await ActivationsService.createActivation(body);
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const updateActivation = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const data = await ActivationsService.updateActivation(id, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const deleteActivation = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await ActivationsService.deleteActivation(id);
    return c.json({ success: true, ...data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};
