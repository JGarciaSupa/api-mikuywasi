import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

export const validateCreateAction = zValidator('json', z.object({
  code: z.string().min(2).max(50).regex(/^[a-z_]+$/, 'Solo letras minúsculas y guiones bajos'),
  name: z.string().min(2).max(100),
  description: z.string().max(255).optional(),
  icon: z.string().max(50).optional(),
  order: z.number().int().min(0).optional(),
}));

export const validateUpdateAction = zValidator('json', z.object({
  code: z.string().min(2).max(50).regex(/^[a-z_]+$/).optional(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(255).optional(),
  icon: z.string().max(50).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}));

export const validateCreateSubAction = zValidator('json', z.object({
  actionId: z.number().int().positive(),
  code: z.string().min(2).max(100).regex(/^[a-z_.]+$/, 'Solo letras minúsculas, guiones bajos y puntos'),
  name: z.string().min(2).max(100),
  description: z.string().max(255).optional(),
  order: z.number().int().min(0).optional(),
}));

export const validateUpdateSubAction = zValidator('json', z.object({
  code: z.string().min(2).max(100).regex(/^[a-z_.]+$/).optional(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(255).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
}));

export const validateCreateBaseRole = zValidator('json', z.object({
  code: z.string().min(2).max(50).regex(/^[a-z_]+$/, 'Solo letras minúsculas y guiones bajos'),
  name: z.string().min(2).max(100),
  description: z.string().max(255).optional(),
  subActionIds: z.array(z.number().int().positive()).min(0).default([]),
}));

export const validateUpdateBaseRole = zValidator('json', z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(255).optional(),
  isActive: z.boolean().optional(),
  subActionIds: z.array(z.number().int().positive()).optional(),
}));

export const validateGrantFeatures = zValidator('json', z.object({
  subActionIds: z.array(z.number().int().positive()).min(1),
}));

export const validateRevokeFeatures = zValidator('json', z.object({
  subActionIds: z.array(z.number().int().positive()).min(1),
}));

export const validateGrantRoles = zValidator('json', z.object({
  baseRoleIds: z.array(z.number().int().positive()).min(1),
}));

export const validateRevokeRoles = zValidator('json', z.object({
  baseRoleIds: z.array(z.number().int().positive()).min(1),
}));
