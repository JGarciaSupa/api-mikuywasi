import type { Context } from 'hono';
import * as productService from '../../services/admin/products.service';

export const getAllProductsController = async (c: Context) => {
  try {
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '10');
    const name = c.req.query('name');
    const categoryId = c.req.query('categoryId') ? parseInt(c.req.query('categoryId')!) : undefined;

    const result = await productService.getAllProducts(page, limit, { name, categoryId });
    return c.json({
      success: true,
      ...result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener los productos'
    }, 500);
  }
};

export const getProductByIdController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const result = await productService.getProductById(id);
    return c.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener el producto'
    }, 404);
  }
};

export const createProductController = async (c: Context) => {
  try {
    const body = await c.req.parseBody();
    const imageFile = body['image'] as File | undefined;
    const data = c.req.valid('form' as never);

    const result = await productService.createProduct(data, imageFile);
    return c.json({
      success: true,
      message: 'Producto creado con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear el producto'
    }, 400);
  }
};

export const updateProductController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    const body = await c.req.parseBody();
    const imageFile = body['image'] as File | undefined;
    const data = c.req.valid('form' as never);

    const result = await productService.updateProduct(id, data, imageFile);
    return c.json({
      success: true,
      message: 'Producto actualizado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el producto'
    }, 400);
  }
};

export const deleteProductController = async (c: Context) => {
  try {
    const id = parseInt(c.req.param('id') || '0');
    await productService.deleteProduct(id);
    return c.json({
      success: true,
      message: 'Producto eliminado con éxito'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar el producto'
    }, 400);
  }
};
