import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { validationHook } from "../../hook";

// Schemas
export const loginSchema = z.object({
  username: z
    .string({ error: "El nombre de usuario es requerido" })
    .trim()
    .min(1, "El nombre de usuario es requerido")
    .max(50, "El nombre de usuario no puede exceder los 50 caracteres"),
  password: z
    .string({ error: "La contraseña es requerida" })
    .min(1, "La contraseña es requerida")
    .max(255, "La contraseña no puede exceder los 255 caracteres"),
});

export const updateProfileSchema = z.object({
  name: z
    .string({ error: "El nombre es requerido" })
    .min(1, "El nombre es requerido")
    .max(255, "El nombre no puede exceder los 255 caracteres"),
});

export const updatePasswordSchema = z
  .object({
    currentPassword: z
      .string({ error: "La contraseña actual es requerida" })
      .min(1, "La contraseña actual es requerida"),
    newPassword: z
      .string({ error: "La nueva contraseña es requerida" })
      .min(6, "La nueva contraseña debe tener al menos 6 caracteres")
      .max(255, "La nueva contraseña no puede exceder los 255 caracteres"),
    confirmPassword: z
      .string({ error: "La confirmación de la contraseña es requerida" })
      .min(1, "La confirmación de la contraseña es requerida"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

// Validators
export const validateLogin = zValidator("json", loginSchema, validationHook);
export const validateUpdateProfile = zValidator("form", updateProfileSchema, validationHook);
export const validateUpdatePassword = zValidator("json", updatePasswordSchema, validationHook);
