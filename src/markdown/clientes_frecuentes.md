# Clientes / Contactos Frecuentes

## 1. Objetivo

Registrar clientes de forma progresiva a medida que se generan pedidos (no un alta masiva
previa): al tomar un pedido, el cajero/mozo busca por teléfono o nombre; si no existe, lo
crea rápido ahí mismo. Con el tiempo se construye una base de clientes frecuentes con su
historial, direcciones de entrega y datos fiscales para facturar más rápido.

## 2. Estado actual (mapeo)

- **No existe ninguna tabla de clientes hoy.** `orders` solo tiene datos sueltos, sin FK a nada:
  - `customerName: varchar(100)` — **obligatorio**.
  - `customerPhone: varchar(20)` — opcional.
  - `customerAddress: text` — opcional, texto libre.
  - `deliveryInfo: jsonb { lat, lng, reference }` — **hoy `lat`/`lng` siempre se guardan en `null`**, no hay captura de GPS en el flujo de pedido, solo un campo de referencia libre.
  (`api-mikuywasi/src/db/tenant/schema/core.ts:412-475`)

- **Ya existe un stub de UI para esto, sin conectar a nada** — en `MenuPage.tsx` (líneas 135-144, 195-204, 1754-1808):
  - Un array mockeado `MOCK_FREQUENT_CUSTOMERS` (nombres/teléfonos/direcciones falsos).
  - Un modal "Cliente Frecuente" que busca sobre ese array mockeado y copia los datos al pedido.
  - Un botón **"+ Nuevo Cliente"** que solo dispara `toast.info("Módulo de clientes frecuentes en desarrollo.")` — no crea nada.
  - El botón "GUARDAR" del modal solo cierra el diálogo, no persiste nada.
  → Alguien ya diseñó la UI esperada; solo falta el backend real y conectar este flujo.

- **`billingDocuments`** ya tiene `buyerDocType/buyerDocNumber/buyerName/buyerAddress/buyerEmail` (`billing.ts:63-67`) — se solapa directamente con la idea de `CustomerTaxProfile`. Estos campos son un **snapshot congelado por documento** (no referencian nada, es el mismo patrón usado en todo el sistema de facturación de esta sesión).

- **No existe catálogo de zonas de entrega con ID.** Solo hay un único polígono GeoJSON por sucursal (`branches.deliveryZone`). Un campo `deliveryZoneId` en direcciones de cliente no tendría hoy a qué apuntar.

- `orders` no tiene `brandId` directo — solo `branchId` (la marca se llega vía `branch.brandId`). No hay precedente de "cliente a nivel de marca" en el sistema.

- Ya existe un selector de punto en mapa (click + GPS del navegador) en `LocationSection.tsx`, pero acoplado a la configuración de sucursal (`useSettings`) — se podría generalizar para reutilizarlo en direcciones de cliente.

- Búsqueda actual de clientes: `OrdersPage.tsx` solo hace un `LIKE` sobre `orders.customerName`/`customerPhone` histórico (`order.service.ts:73-74`) — no hay una tabla ni un endpoint de clientes de por sí.

## 3. Decisiones ya tomadas contigo

- **Contactos múltiples**: se implementa `CustomerContact` como tabla aparte (no un solo phone/email en `Customer`), tal como lo propusiste — permite varios teléfonos/emails por cliente con `isPrimary`.
- **Teléfono no es único**: se indexa para búsqueda rápida, pero no es un constraint único. Si dos clientes comparten número (o alguien recicló uno viejo), el cajero verá varios resultados y elige o crea uno nuevo — evita bloqueos raros.

## 4. Diseño de schema propuesto (tenant, nueva)

```
customers
  id              serial PK
  customerType    enum('person','company')
  firstName       varchar(100)          -- o razón social si es company
  lastName        varchar(100)          -- null si es company
  status          enum('active','inactive') default 'active'
  createdAt / updatedAt

customer_contacts
  id              serial PK
  customerId      FK → customers.id (cascade)
  contactType     enum('phone','mobile','email')
  value           varchar(150)
  isPrimary       boolean default false
  índice: (customerId), (value) -- para búsqueda, NO único

customer_addresses
  id                    serial PK
  customerId            FK → customers.id (cascade)
  name                  varchar(100)   -- "Casa", "Oficina"...
  address               text
  district              varchar(100)
  latitude / longitude  decimal
  deliveryInstructions  text
  isDefault             boolean default false
  -- SIN deliveryZoneId por ahora (ver sección 6)

customer_tax_profiles
  id              serial PK
  customerId      FK → customers.id (cascade)
  documentType    varchar(20)   -- código del catálogo master identity_document_types (RUC/DNI/CE ya existente)
  documentNumber  varchar(20)
  legalName       varchar(200)
  taxAddress      text
```

## 5. Cambios a tablas existentes

- **`orders`**: se agrega `customerId` (nullable, FK a `customers.id`). Los campos actuales
  (`customerName`, `customerPhone`, `customerAddress`) **se mantienen intactos** como snapshot
  histórico del pedido — no se tocan ni se eliminan. Un pedido puede seguir siendo anónimo
  (`customerId = null`) exactamente igual que hoy.

## 6. Relación con Facturación (importante)

`CustomerTaxProfile` **no reemplaza** los campos `buyer*` de `billingDocuments`. Su rol es
**prellenar** el formulario de facturación cuando el pedido está vinculado a un cliente
conocido — pero el documento sigue congelando su propio snapshot al emitirse (mismo criterio
que ya usamos con `buyerName`/`sunatAnexo`: si el cliente cambia su razón social después, no
debe alterar comprobantes ya emitidos).

`documentType` en `customer_tax_profiles` usa el mismo catálogo dinámico
`identity_document_types` (master) que ya conectamos en `OrderBillingSection.tsx` — no se
inventa un nuevo set de tipos de documento.

## 7. Pendiente de decidir / fuera de alcance por ahora

- **`deliveryZoneId` en `CustomerAddress`**: no hay catálogo de zonas con ID hoy (solo un
  polígono por sucursal). Se deja fuera del schema inicial; si más adelante se necesitan
  múltiples zonas con tarifas distintas por sucursal, es una feature aparte que primero
  requiere ese catálogo.
- **Selector de GPS reutilizable**: el patrón de mapa con click + geolocalización ya existe
  en `LocationSection.tsx` pero atado a configuración de sucursal — habría que extraerlo a un
  componente genérico para usarlo también en direcciones de cliente.

## 8. Frontend — qué se reemplaza

- `MenuPage.tsx`: quitar `MOCK_FREQUENT_CUSTOMERS` y conectar el modal "Cliente Frecuente"
  existente a una búsqueda real (`GET /customers?search=...`). El botón "+ Nuevo Cliente" pasa
  a abrir un formulario real de alta rápida (nombre + teléfono como mínimo, resto opcional).
- Nueva pantalla de gestión de Clientes (listado + ficha con contactos/direcciones/perfil
  fiscal) — para edición fuera del flujo de pedido.

## 9. Checklist

- [ ] Schema: `customers`, `customer_contacts`, `customer_addresses`, `customer_tax_profiles` (tenant).
- [ ] Schema: `orders.customerId` (FK nullable).
- [ ] Backend: servicio + rutas CRUD de clientes, búsqueda por nombre/teléfono.
- [ ] Backend: `createOrder` acepta `customerId` opcional.
- [ ] Backend: al facturar, si el pedido tiene `customerId` con `CustomerTaxProfile`, prellenar (no forzar) los campos del comprador.
- [ ] Frontend: reemplazar mock en `MenuPage.tsx` por búsqueda/creación real.
- [ ] Frontend: pantalla de gestión de Clientes (tabla + modal, mismo patrón usado en el resto del admin).

¿Continúo con esto?
