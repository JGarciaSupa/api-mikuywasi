# Correo de envío del restaurante — `/api/mail-settings`

Cada restaurante (tenant) configura su propia cuenta de correo, por ejemplo Gmail con una
**contraseña de aplicación**, desde la que el sistema envía sus correos (hoy: los reportes del
cierre de caja). No hay cuenta global del sistema. Permiso: `administracion.correo_envio`
("Correo de envío"; lo traen Administrador y Administrador del local).

Tabla tenant `mail_settings` (migración `0101_create_mail_settings`), una sola fila. La contraseña se
guarda cifrada con AES-256-GCM (`src/utils/secret-crypto.ts`, clave `SETTINGS_ENCRYPTION_KEY` o
derivada de `JWT_SECRET`) y **nunca** se devuelve.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/mail-settings` | `{ host, port, username, fromName, isActive, hasPassword, updatedAt }` o `null` si no hay configuración |
| PUT | `/api/mail-settings` | Guarda `{ host, port (25/465/587/2525), username (correo), password?, fromName?, isActive? }`. `password` vacío = mantener la guardada (obligatoria la primera vez; se quitan los espacios que Gmail muestra) |
| POST | `/api/mail-settings/test` | `{ to }`: envía un correo de prueba con la cuenta guardada. 422 con mensaje claro si falla el usuario/contraseña, la conexión o si no hay configuración |

Gmail: servidor `smtp.gmail.com`, puerto `465`, usuario = la dirección de Gmail, contraseña = la de
aplicación de 16 caracteres (requiere verificación en dos pasos; myaccount.google.com/apppasswords).
El remitente es siempre la cuenta autenticada; `fromName` es el nombre que se muestra.
