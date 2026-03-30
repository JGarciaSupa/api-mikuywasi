# API de Gestión de Tenants (Admin)

Esta API permite a los super-administradores gestionar los negocios (tenants) registrados en la plataforma.

**Base URL**: `/admin/tenants`  
**Autenticación**: Requerida (Bearer Token - Super Admin)

---

## 1. Obtener todos los tenants
Retorna la lista completa de negocios registrados.

*   **URL**: `/`
*   **Método**: `GET`
*   **Parámetros Query**:
    | Parámetro | Tipo | Defecto | Descripción |
    | :--- | :--- | :--- | :--- |
    | `page` | number | `1` | Número de página. |
    | `limit` | number | `10` | Cantidad de registros por página. |
    | `name` | string | - | Filtrar por nombre (búsqueda parcial). |
    | `status` | string | - | Filtrar por estado (`active`, `inactive`). |
    | `planId` | number | - | Filtrar por el ID del plan asignado. |

*   **Respuesta Exitosa (200 OK)**:
    ```json
    {
      "success": true,
      "data": [
        {
          "id": 1,
          "name": "Mi Negocio",
          "slug": "mi-negocio",
          ...
        }
      ],
      "meta": {
        "total": 52,
        "page": 1,
        "limit": 10,
        "totalPages": 6
      }
    }
    ```

---

## 2. Crear un nuevo tenant
Registra un nuevo negocio y crea automáticamente su primera suscripción e historial de pago.

*   **URL**: `/`
*   **Método**: `POST`
*   **Cuerpo de la Petición (JSON)**:
    | Campo | Tipo | Requerido | Descripción |
    | :--- | :--- | :---: | :--- |
    | `name` | string | Sí | Nombre del negocio. |
    | `slug` | string | Sí | URL amigable (solo minúsculas, números y guiones). |
    | `planId` | number | Sí | ID del plan a asignar. |
    | `billingCycle` | string | Sí | Ciclo de facturación: `monthly` o `yearly`. |
    | `planEndsAt` | string (ISO) | No | Fecha de fin personalizada (Trial/Prueba). Si se envía, el `pricePaid` será 0.00. |
    | `email` | string | No | Email de contacto. |
    | `phone` | string | No | Teléfono de contacto. |
    | `ownerName` | string | No | Nombre del dueño. |
    | `status` | string | No | `active` (defecto) o `inactive`. |

*   **Ejemplo de Petición (Pago Estándar)**:
    ```json
    {
      "name": "Pizzeria Roma",
      "slug": "pizzeria-roma",
      "planId": 1,
      "billingCycle": "monthly"
    }
    ```

*   **Ejemplo de Petición (Periodo de Prueba - 15 días)**:
    ```json
    {
      "name": "Test Cafe",
      "slug": "test-cafe",
      "planId": 1,
      "billingCycle": "monthly",
      "planEndsAt": "2026-04-13T00:00:00.000Z"
    }
    ```

*   **Respuesta Exitosa (201 Created)**:
    ```json
    {
      "success": true,
      "message": "Tenant creado con éxito",
      "data": { ... }
    }
    ```

---

## 3. Actualizar un tenant
Actualiza la información básica de un negocio o su estado.

*   **URL**: `/:id`
*   **Método**: `PATCH`
*   **Cuerpo de la Petición (JSON)**: Soporta actualización parcial de cualquier campo del tenant (nombre, slug, email, status, etc.).

---

## 4. Renovar suscripción manualmente
Permite extender el periodo de suscripción de un negocio, permitiendo fechas retroactivas.

*   **URL**: `/:id/renew`
*   **Método**: `POST`
*   **Cuerpo de la Petición (JSON)**:
    | Campo | Tipo | Requerido | Descripción |
    | :--- | :--- | :---: | :--- |
    | `planId` | number | No | Cambiar el plan en esta renovación. |
    | `billingCycle` | string | No | `monthly` o `yearly`. |
    | `startDate` | string (ISO) | No | Fecha de inicio. Por defecto usa el `planEndsAt` actual (ideal para renovaciones retroactivas). |
    | `endDate` | string (ISO) | No | Fecha de fin. Si no se envía, se calcula según el ciclo. |
    | `pricePaid` | string | No | Monto cobrado (ej. "45.00"). Por defecto usa el precio del plan. |

*   **Lógica de Retroactividad**:
    Si un cliente venció el **01/03** y te paga el **05/03**, puedes enviar `startDate: "2026-03-01T..."` para que su nuevo mes venza el **01/04**, evitando regalarle los 4 días de retraso.

*   **Errores Comunes**:
    - `400 Bad Request`: Datos de validación incorrectos o tenant no encontrado.
    - `401 Unauthorized`: Token faltante o inválido.
