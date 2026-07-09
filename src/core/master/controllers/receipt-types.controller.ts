import type { Context } from 'hono';
import * as ReceiptTypesService from '../services/receipt-types.service';

export const getReceiptTypes = async (c: Context) => {
  try {
    const data = await ReceiptTypesService.getReceiptTypes();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const getReceiptTypeById = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await ReceiptTypesService.getReceiptTypeById(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 404);
  }
};

export const createReceiptType = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await ReceiptTypesService.createReceiptType(body);
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const updateReceiptType = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const data = await ReceiptTypesService.updateReceiptType(id, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const deleteReceiptType = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await ReceiptTypesService.deleteReceiptType(id);
    return c.json({ success: true, ...data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};
