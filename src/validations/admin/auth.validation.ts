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

// Validators
export const validateLogin = zValidator('json', loginSchema, validationHook);
