# 🌐 Módulo Master — Control Central SaaS

Documentación completa del módulo `master`, responsable de gestionar la infraestructura central del sistema multi-tenant: super-admins, planes, servidores de bases de datos, tenants y suscripciones.

---

## 📁 Estructura de archivos

```
backend/src/core/master/
├── index.ts
├── middleware/
│   └── master-auth.middleware.ts
├── validations/
│   ├── users.validation.ts
│   ├── plans.validation.ts
│   ├── db-servers.validation.ts
│   ├── tenants.validation.ts
│   └── subscriptions.validation.ts
├── services/
│   ├── users.service.ts
│   ├── plans.service.ts
│   ├── db-servers.service.ts
│   ├── tenants.service.ts
│   └── subscriptions.service.ts
├── controllers/
│   ├── users.controller.ts
│   ├── plans.controller.ts
│   ├── db-servers.controller.ts
│   ├── tenants.controller.ts
│   └── subscriptions.controller.ts
└── routes/
    ├── users.routes.ts
    ├── plans.routes.ts
    ├── db-servers.routes.ts
    ├── tenants.routes.ts
    └── subscriptions.routes.ts
```

---

## 🗺️ Base URL

```
/api/master
```

---

## 🔐 Autenticación

Todos los endpoints (excepto `POST /users/login`) requieren un **Bearer Token** en el header:

```
Authorization: Bearer <token>
```

El token debe pertenecer a un usuario con rol `super-admin`. Ver [`master-auth.middleware.ts`](../../src/core/master/middleware/master-auth.middleware.ts).

---

## 📄 Documentación por recurso

| Recurso | Archivo |
|---|---|
| 👤 Usuarios (Super-admins) | [users.md](./users.md) |
| 💳 Planes | [plans.md](./plans.md) |
| 🖥️ Servidores de BD | [db-servers.md](./db-servers.md) |
| 🏢 Tenants | [tenants.md](./tenants.md) |
| 🧾 Suscripciones | [subscriptions.md](./subscriptions.md) |

---

## 🧩 Flujo de negocio principal

```
1. Crear super-admin (POST /master/users)
2. Crear planes (POST /master/plans)
3. Registrar servidor de BD (POST /master/db-servers)
4. Crear tenant → asigna servidor + genera suscripción automáticamente
5. Renovar suscripción (POST /master/tenants/:id/renew)
6. Consultar historial (GET /master/subscriptions)
```

---

## ⚙️ Lógica de sharding (servidores)

Cuando se crea un **tenant**, el sistema:

1. Verifica que el servidor exista y esté activo (`isActive = true`)
2. Verifica que `currentTenants < maxTenants`
3. Crea el tenant y la suscripción inicial en una **transacción**
4. Incrementa `currentTenants` en el servidor asignado

Cuando se elimina un tenant, se decrementa `currentTenants` automáticamente.

> No se puede eliminar un servidor que tenga tenants asignados.

---

## 📦 Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | [Hono](https://hono.dev) |
| ORM | [Drizzle ORM](https://orm.drizzle.team) |
| Validación | [Zod](https://zod.dev) + `@hono/zod-validator` |
| Auth | JWT (`hono/jwt`) |
| Hash | `Bun.password` (bcrypt) |
| Base de datos | PostgreSQL (`masterDb`) |
