import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { validationHook } from "../hook";

// Schemas
export const loginSchema = z.object({
  email: z
    .string({ error: "El correo electrónico es requerido" })
    .email("El correo electrónico no es válido")
    .max(255, "El correo electrónico no puede exceder los 255 caracteres"),
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
      .max(255),
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
export const validateUpdateProfile = zValidator("form" as any, updateProfileSchema, validationHook);
export const validateUpdatePassword = zValidator("json", updatePasswordSchema, validationHook);
