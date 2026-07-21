import type { Context } from 'hono';
import * as customersService from '../../../services/admin/documents/customers.service';
import { jsonError } from '@/utils/helpers';

// Sin validación de permisos por ahora (a definir más adelante quién puede
// crear/editar clientes).

export const searchCustomersController = async (c: Context) => {
  try {
    const search = c.req.query('search');
    const data = await customersService.searchCustomers(search);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al buscar clientes');
  }
};

export const getCustomerController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const data = await customersService.getCustomerById(id);
    if (!data) return c.json({ success: false, message: 'Cliente no encontrado' }, 404);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al obtener cliente');
  }
};

export const createCustomerController = async (c: Context) => {
  try {
    const body = await c.req.json();
    const data = await customersService.createCustomer(body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al crear cliente');
  }
};

export const updateCustomerController = async (c: Context) => {
  try {
    const id = Number(c.req.param('id'));
    const body = await c.req.json();
    const data = await customersService.updateCustomer(id, body);
    return c.json({ success: true, data });
  } catch (e) {
    return jsonError(c, e, 'Error al actualizar cliente');
  }
};

export const addContactController = async (c: Context) => {
  try {
    const customerId = Number(c.req.param('id'));
    const body = await c.req.json();
    const data = await customersService.addContact(customerId, body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al agregar contacto');
  }
};

export const deleteContactController = async (c: Context) => {
  try {
    const id = Number(c.req.param('contactId'));
    await customersService.deleteContact(id);
    return c.json({ success: true });
  } catch (e) {
    return jsonError(c, e, 'Error al eliminar contacto');
  }
};

export const addAddressController = async (c: Context) => {
  try {
    const customerId = Number(c.req.param('id'));
    const body = await c.req.json();
    const data = await customersService.addAddress(customerId, body);
    return c.json({ success: true, data }, 201);
  } catch (e) {
    return jsonError(c, e, 'Error al agregar dirección');
  }
};

export const deleteAddressController = async (c: Context) => {
  try {
    const id = Number(c.req.param('addressId'));
    await customersService.deleteAddress(id);
    return c.json({ success: true });
  } catch (e) {
    return jsonError(c, e, 'Error al eliminar dirección');
  }
};

// Los perfiles fiscales (RUC/DNI) ya NO viven aquí — ver tax-profiles.controller.ts.
