# 🗄️ Guía de Migraciones con Drizzle ORM

Este documento proporciona una guía detallada sobre cómo gestionar las migraciones de base de datos en nuestro sistema multi-tenant utilizando **Drizzle ORM** y **Drizzle Kit**.

Nuestra arquitectura utiliza un modelo híbrido de base de datos:
1. **Base de Datos Maestra (Master/Landlord):** Almacena la información central, como el registro de tenants, servidores, credenciales y configuraciones globales.
2. **Bases de Datos de Tenants:** Cada tenant (cliente/restaurante) posee su propia base de datos aislada e independiente con la estructura de negocio (menús, órdenes, mesas, etc.).

---

## 🗺️ Estructura del Sistema de Migraciones

- **Configuración Master:** `drizzle.config.ts` ➡️ Administra el esquema central `./src/db/master/schema.ts` y exporta a `./drizzle/master`.
- **Configuración Tenants:** `drizzle.tenant.config.ts` ➡️ Administra el esquema de los restaurantes `./src/db/tenant/schema.ts` y exporta a `./drizzle/tenant`.

---

## 🏛️ 1. Migraciones de la Base de Datos Maestra (Master)

Estas migraciones se aplican directamente a la base de datos central a través de la configuración predeterminada de Drizzle Kit.

### Generar una nueva migración
Cuando realices cambios en el esquema del master (`./src/db/master/schema.ts`), genera los archivos de migración SQL ejecutando:
```bash
npx drizzle-kit generate
```
*Esto leerá el archivo de configuración `drizzle.config.ts` y guardará los archivos `.sql` generados en la carpeta `./drizzle/master`.*

### Aplicar las migraciones a la Base de Datos Maestra
Para aplicar los cambios SQL pendientes en tu base de datos maestra local o de producción:
```bash
npx drizzle-kit migrate
```
*Este comando lee las credenciales del archivo `.env` (a través de `DATABASE_URL`) y ejecuta las migraciones pendientes en el servidor central.*

---

## 🏢 2. Migraciones de Bases de Datos de Tenants (Multi-tenant)

Dado que cada restaurante tiene su propia base de datos, la generación y la aplicación de migraciones difiere del flujo estándar.

### Generar una nueva migración para los Tenants
Cuando agregues o modifiques campos en el esquema común de los tenants (`./src/db/tenant/schema.ts`), genera la migración especificando el archivo de configuración de tenants:
```bash
npx drizzle-kit generate --config=drizzle.tenant.config.ts --name <nombre_descriptivo_de_migración>
```
*Ejemplo:*
```bash
npx drizzle-kit generate --config=drizzle.tenant.config.ts --name add_field_updatedAt
```
*Este comando guardará los archivos de migración `.sql` en `./drizzle/tenant`.*

### Aplicar las migraciones a todos los Tenants (Orquestador)
Para actualizar las bases de datos de todos los tenants registrados en la base de datos maestra, hemos creado un script orquestador personalizado. 

Para ejecutarlo, utiliza el siguiente comando de npm/bun:
```bash
bun run tenants:migrate
```
*(Que por debajo ejecuta: `bun run src/scripts/migrate-tenants.ts`)*

#### ¿Cómo funciona este comando?
1. Conecta con la **Base de Datos Maestra** para obtener la lista de todos los tenants activos y la configuración del servidor de base de datos asociado a cada uno.
2. Genera de forma segura cadenas de conexión individuales para cada base de datos de tenant.
3. Lee las migraciones ubicadas en `./drizzle/tenant` utilizando el migrador programático de Drizzle (`drizzle-orm/node-postgres/migrator`).
4. Ejecuta e instala ordenadamente las migraciones pendientes en cada base de datos.
5. Imprime un reporte detallado con el resumen de éxitos y fallas.

---

## ⚡ Flujo de Trabajo Recomendado al Hacer Cambios

### Escenario A: Modificar el esquema de los Restaurantes (Tenants)
1. Edita el archivo `./src/db/tenant/schema.ts` (por ejemplo, añadiendo un campo `updatedAt` a una tabla).
2. Genera los archivos SQL de migración:
   ```bash
   npx drizzle-kit generate --config=drizzle.tenant.config.ts --name add_field_updatedAt
   ```
3. Revisa visualmente la migración generada en la carpeta `./drizzle/tenant`.
4. Aplica los cambios a las bases de datos de todos tus tenants activos:
   ```bash
   bun run tenants:migrate
   ```

### Escenario B: Modificar el esquema de Administración (Master)
1. Edita el archivo `./src/db/master/schema.ts` (por ejemplo, agregando una nueva columna a la tabla de tenants).
2. Genera la migración central:
   ```bash
   npx drizzle-kit generate
   ```
3. Aplica los cambios a tu base de datos maestra local o de producción:
   ```bash
   npx drizzle-kit migrate
   ```

