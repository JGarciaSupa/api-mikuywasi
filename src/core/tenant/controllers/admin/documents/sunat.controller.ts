import type { Context } from 'hono';
import * as sunatService from '../../../services/admin/documents/sunat.service';
import { z } from 'zod';

const searchSchema = z.object({
  searchTerm: z.enum(['ruc', 'dni']),
  value: z.string().min(1, 'El valor no puede estar vacío')
});

export const searchDocumentController = async (c: Context) => {
  try {
    const searchTerm = c.req.query("searchTerm");
    const value = c.req.query("value");

    const parsed = searchSchema.safeParse({ searchTerm, value });

    if (!parsed.success) {
      return c.json({ 
        success: false, 
        message: "Parámetros inválidos", 
        errors: parsed.error.format() 
      }, 400);
    }

    const data = await sunatService.searchDocument(parsed.data);
    
    return c.json(data);
  } catch (error: any) {
    console.error("Error fetching SUNAT data:", error);
    return c.json({ 
      success: false, 
      message: error.message || "Error interno del servidor" 
    }, 500);
  }
};
