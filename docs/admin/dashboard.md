# API de Dashboard (Admin)

Esta API proporciona estadísticas globales y métricas clave para el panel del Super Administrador.

**Base URL**: `/admin/dashboard`  
**Autenticación**: Requerida (Bearer Token - Super Admin)

---

## 1. Obtener estadísticas globales
Retorna un resumen de ingresos, inquilinos (tenants), pedidos y suscripciones por vencer.

*   **URL**: `/stats`
*   **Método**: `GET`
*   **Respuesta Exitosa (200 OK)**:
    ```json
    {
      "success": true,
      "data": {
        "totalIncome": {
          "value": 1520.50,
          "growth": 12.5,
          "currentMonth": 450.00
        },
        "activeTenants": {
          "value": 24,
          "newThisMonth": 3
        },
        "totalOrders": {
          "value": 1250,
          "growth": 5.2,
          "currentMonth": 310
        },
        "totalUsers": {
          "value": 45,
          "newThisMonth": 2
        },
        "recentTenants": [
          {
            "id": 1,
            "name": "Pizzeria Roma",
            "slug": "pizzeria-roma",
            "plan": { "id": 1, "name": "Básico" },
            "createdAt": "2026-03-29T..."
          }
        ],
        "expiringSubscriptions": [
          {
            "id": 15,
            "tenantId": 5,
            "endDate": "2026-04-05T...",
            "tenant": { "name": "Sushi House" }
          }
        ]
      }
    }
    ```

*   **Errores Comunes**:
    - `401 Unauthorized`: Token faltante o inválido.
    - `403 Forbidden`: El usuario no tiene el rol `super-admin`.
