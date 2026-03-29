export const validationHook = (result: any, c: any) => {
  if (!result.success) {
    return c.json({
      success: false,
      message: result.error.issues[0].message
    }, 400);
  }
};
