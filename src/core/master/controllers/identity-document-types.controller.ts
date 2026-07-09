import type { Context } from 'hono';
import * as IdentityDocumentTypesService from '../services/identity-document-types.service';

export const getIdentityDocumentTypes = async (c: Context) => {
  try {
    const data = await IdentityDocumentTypesService.getIdentityDocumentTypes();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 500);
  }
};

export const getIdentityDocumentTypeById = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await IdentityDocumentTypesService.getIdentityDocumentTypeById(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 404);
  }
};

export const createIdentityDocumentType = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await IdentityDocumentTypesService.createIdentityDocumentType(body);
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const updateIdentityDocumentType = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const data = await IdentityDocumentTypesService.updateIdentityDocumentType(id, body);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};

export const deleteIdentityDocumentType = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await IdentityDocumentTypesService.deleteIdentityDocumentType(id);
    return c.json({ success: true, ...data });
  } catch (error: any) {
    return c.json({ success: false, message: error.message }, 400);
  }
};
