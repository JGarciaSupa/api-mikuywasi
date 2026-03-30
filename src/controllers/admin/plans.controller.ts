import type { Context } from 'hono';
import { createPlan, getAllPlans, reorderPlans, softDeletePlan, updatePlan, updateVisibility } from '../../services/admin/plans.service';

export const getAllPlansController = async (c: Context) => {
  try {
    const results = await getAllPlans();
    return c.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al obtener los planes'
    }, 500);
  }
};

export const createPlanController = async (c: Context) => {
  try {
    const data = c.req.valid('json' as never);
    const result = await createPlan(data);
    return c.json({
      success: true,
      message: 'Plan creado con éxito',
      data: result
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al crear el plan'
    }, 400);
  }
};

export const updatePlanController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de plan requerido' }, 400);
    }
    const id = parseInt(idParam);
    const data = c.req.valid('json' as never);
    
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de plan inválido' }, 400);
    }

    const result = await updatePlan(id, data);
    
    if (!result) {
      return c.json({ success: false, message: 'Plan no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: 'Plan actualizado con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar el plan'
    }, 400);
  }
};

export const softDeletePlanController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de plan requerido' }, 400);
    }
    const id = parseInt(idParam);
    
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de plan inválido' }, 400);
    }

    const result = await softDeletePlan(id);
    
    if (!result) {
      return c.json({ success: false, message: 'Plan no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: 'Plan eliminado (lógicamente) con éxito',
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al eliminar el plan'
    }, 400);
  }
};

export const updateVisibilityController = async (c: Context) => {
  try {
    const idParam = c.req.param('id');
    if (!idParam) {
      return c.json({ success: false, message: 'ID de plan requerido' }, 400);
    }
    const id = parseInt(idParam);
    const { visible } = await c.req.json();
    
    if (isNaN(id)) {
      return c.json({ success: false, message: 'ID de plan inválido' }, 400);
    }

    if (typeof visible !== 'boolean') {
      return c.json({ success: false, message: 'El campo visible debe ser booleano' }, 400);
    }

    const result = await updateVisibility(id, visible);
    
    if (!result) {
      return c.json({ success: false, message: 'Plan no encontrado' }, 404);
    }

    return c.json({
      success: true,
      message: `Visibilidad del plan actualizada a ${visible ? 'Visible' : 'Oculto'}`,
      data: result
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al actualizar la visibilidad'
    }, 400);
  }
};

export const reorderPlansController = async (c: Context) => {
  try {
    const { plans } = c.req.valid('json' as never);
    const results = await reorderPlans(plans);

    return c.json({
      success: true,
      message: 'Planes reordenados con éxito',
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      message: error.message || 'Error al reordenar los planes'
    }, 400);
  }
};
