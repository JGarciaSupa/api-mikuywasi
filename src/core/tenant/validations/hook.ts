import type { Context } from 'hono';

type ValidationResult =
  | { success: true }
  | { success: false; error: { issues: { message: string }[] } };

export const validationHook = (result: ValidationResult, c: Context): Response | void => {
  if (!result.success) {
    return c.json({
      status: false,
      message: result.error.issues[0].message
    }, 400);
  }
};
