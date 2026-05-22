import { masterDb } from '../../../db';
import { plans } from '../../../db/master/schema';
import { eq } from 'drizzle-orm';
import type { CreatePlanInput, UpdatePlanInput } from '../validations/plans.validation';

export const getAllPlans = async (includeHidden = false) => {
  const result = await masterDb.query.plans.findMany({
    where: includeHidden ? undefined : eq(plans.visible, true),
    orderBy: (plans, { asc }) => [asc(plans.monthlyPrice)],
  });
  return result;
};

export const getPlanById = async (id: number) => {
  const plan = await masterDb.query.plans.findFirst({
    where: eq(plans.id, id),
  });
  if (!plan) throw new Error('Plan no encontrado');
  return plan;
};

export const createPlan = async (data: CreatePlanInput) => {
  const [newPlan] = await masterDb.insert(plans).values({
    ...data,
    features: data.features,
    updatedAt: new Date(),
  }).returning();
  return newPlan;
};

export const updatePlan = async (id: number, data: UpdatePlanInput) => {
  const [updated] = await masterDb.update(plans)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(plans.id, id))
    .returning();

  if (!updated) throw new Error('Plan no encontrado');
  return updated;
};

export const deletePlan = async (id: number) => {
  const [deleted] = await masterDb.delete(plans)
    .where(eq(plans.id, id))
    .returning();

  if (!deleted) throw new Error('Plan no encontrado');
  return { message: 'Plan eliminado correctamente' };
};
