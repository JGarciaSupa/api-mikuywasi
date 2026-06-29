src/
├── index.ts
├── db/
│   ├── master/schema.ts
│   └── tenant/schema/
│       ├── core.ts
│       ├── billing.ts
│       ├── rbac.ts
│       └── warehouse.ts
├── shared/                          ← utilidades compartidas entre master y tenant
│   ├── middleware/
│   └── utils/
├── jobs/
├── scripts/
│   core
├── master/                          ← contexto master (plataforma)
│   ├── index.ts                     ← router raíz del master
│   ├── middleware/
│   │   └── auth.middleware.ts
│   └── modules/                     ← cada tabla/dominio = un módulo
│       ├── tenants/
│       │   ├── tenants.controller.ts
│       │   ├── tenants.service.ts
│       │   ├── tenants.routes.ts
│       │   └── tenants.validation.ts
│       ├── plans/
│       ├── users/
│       ├── subscriptions/
│       ├── db-servers/
│       └── rbac/
│
└── tenant/                          ← contexto tenant (multi-tenant)
    ├── index.ts
    ├── middleware/
    │   ├── auth.middleware.ts
    │   └── tenant-context.middleware.ts
    └── modules/
        ├── admin/
        │   ├── index.ts             ← router del admin
        │   ├── products/
        │   │   ├── products.controller.ts
        │   │   ├── products.service.ts
        │   │   ├── products.routes.ts
        │   │   └── products.validation.ts
        │   ├── categories/
        │   ├── orders/
        │   ├── tables/
        │   ├── kitchen/
        │   ├── staff/
        │   ├── settings/
        │   └── ...
        ├── client/
        │   ├── index.ts
        │   └── orders/
        └── warehouse/
            ├── index.ts
            ├── catalog/
            ├── movements/
            └── ...
