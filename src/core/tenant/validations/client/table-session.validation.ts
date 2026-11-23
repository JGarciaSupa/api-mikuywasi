import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';

const roundItemSchema = z.object({
  productId: z.number().int().positive(),
  quantity: z.number().int().min(1).max(99),
  alternatives: z.array(z.string().trim().min(1).max(80)).max(12).optional().default([]),
  extraIds: z.array(z.number().int().positive()).max(12).optional().default([]),
  notes: z.string().trim().max(100).optional(),
});

export const joinTableSessionSchema = z.object({
  mesa: z.string().trim().min(1).max(8),
  deviceId: z.string().trim().min(8).max(64),
  alias: z.string().trim().min(1).max(40).optional(),
  pin: z.string().regex(/^\d{4}$/).optional(),
});

export const submitRoundSchema = z.object({
  items: z.array(roundItemSchema).min(1).max(30),
});

export const createCallSchema = z.object({
  reason: z.enum(['attention', 'bill', 'utensils', 'other']),
  note: z.string().trim().max(120).optional(),
});

export const rejectRoundSchema = z.object({
  reason: z.string().trim().min(1).max(200),
});

export const acceptRoundSchema = z.object({
  paxAdults: z.number().int().min(0).max(99).optional(),
  paxChildren: z.number().int().min(0).max(99).optional(),
});

export const validateJoinTableSession = zValidator('json', joinTableSessionSchema);
export const validateSubmitRound = zValidator('json', submitRoundSchema);
export const validateCreateCall = zValidator('json', createCallSchema);
export const validateRejectRound = zValidator('json', rejectRoundSchema);
export const validateAcceptRound = zValidator('json', acceptRoundSchema);
