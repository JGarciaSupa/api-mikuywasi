# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Multi-tenant restaurant/POS SaaS backend ("Mikuywasi" / GastroPro360) built with **Hono** on **Bun**, using **Drizzle ORM** over **PostgreSQL**, with **Redis** caching and **Cloudflare R2** for file storage.

## Commands

Package manager: **Bun** (see `bun.lock`; `package-lock.json` also exists but Bun is the intended runtime per the Dockerfile and `dev` script).

```bash
bun install               # install dependencies
bun run dev                # start dev server with hot reload (src/index.ts)
bun test                   # run tests (bun:test) — no test files currently exist in the repo
```

There is no lint or typecheck script defined in `package.json`; use `bunx tsc --noEmit` if you need to typecheck.

### Database migrations (Drizzle)

This project has **two separate schemas/migration sets**: one for the master (landlord) DB and one for the per-tenant DBs. See `src/markdown/comands.drizzle.md` for the full guide.

```bash
# Master DB (src/db/master/schema.ts → drizzle/master)
npx drizzle-kit generate                                            # generate migration from schema changes
npx drizzle-kit migrate                                             # apply pending migrations (uses DATABASE_URL)

# Tenant DB (src/db/tenant/schema.ts → drizzle/tenant)
npx drizzle-kit generate --config=drizzle.tenant.config.ts --name <descriptive_name>
bun run tenants:migrate                                              # apply pending tenant migrations to every registered tenant
```

Other maintenance scripts (`src/scripts/*.ts`, run via `bun run <script>` or the npm scripts below):

```bash
bun run master:create-user      # create a master super-admin user
bun run master:seed-rbac        # seed master RBAC actions/roles
bun run tenants:seed            # seed a tenant DB
bun run tenants:clear-sessions  # clear tenant sessions
```

## Architecture

### Two isolated "worlds": master vs. tenant

- **Master DB** (`src/db/master/schema.ts`, connected via `masterDb` in `src/db/index.ts`): the landlord database. Holds tenants, subscription plans, DB servers (sharding targets), super-admin users, global catalogs (currencies, countries, receipt types, sales-channel classifications, RBAC for master users).
- **Tenant DBs** (`src/db/tenant/schema/*.ts`): each tenant (restaurant) has its own **physically separate Postgres database**. Connection pools are created lazily and cached (LRU, capped at `MAX_CACHED_POOLS = 100`) in `getTenantDb()` in `src/db/index.ts`.

Resolving *which* tenant DB to use for a request is the job of `tenantContextMiddleware` (`src/core/tenant/middleware/tenant-context.middleware.ts`):
1. Reads tenant identity from `X-Tenant-Slug` header, `X-Tenant-ID` header (falls back to slug if non-numeric), or a `slug`/`tenantSlug` route param/query.
2. Resolves the tenant via `redis/getTenant.ts` (`getTenantBySlug`), which checks Redis cache first (`tenant:<slug>`, 1h TTL) and falls back to `masterDb` on a cache miss (or if Redis is down).
3. Gets/creates a pooled Drizzle instance for that tenant's DB (`getTenantDb(dbUrl)`).
4. Runs the rest of the request inside `AsyncLocalStorage` via `runWithTenantContext()` (`src/utils/tenant-context.ts`), so downstream code never threads a `db`/`tenantId` parameter manually.

Inside any tenant-scoped service, get the current DB/tenant with:
```ts
import { getTenantDb, getTenantId } from '@/utils/tenant-context';
const db = getTenantDb(); // typed NodePgDatabase<typeof tenantSchema>, resolved from AsyncLocalStorage
```
Calling this outside of a request that went through `tenantContextMiddleware` throws.

### Routing layers

Top-level app (`src/index.ts`) mounts:
- `/api/master` → `src/core/master` (master/platform admin API)
- `/api` → `src/core/tenant` → which internally mounts `/admin`, `/client`, and (again) `/master`

So tenant-facing endpoints live under `/api/admin/*` (staff/back-office, JWT with tenant context) and `/api/client/*` (public-facing, e.g. menu/orders/tables by tenant slug).

Each domain module under `src/core/{master,tenant}` follows the same 4-layer pattern, split into parallel directory trees (not one folder per feature):
```
controllers/<area>/<feature>.controller.ts   # Hono handlers, try/catch, shape { success, message, data }
services/<area>/<feature>.service.ts         # business logic + Drizzle queries, no Hono Context
routes/<area>/<feature>/index.ts             # Hono router: applies middleware, wires zValidator, mounts controller fns
validations/<area>/<feature>.validation.ts   # zod schemas + zValidator('json', schema) exports
```
`<area>` mirrors the domain, e.g. `admin/config-local/sales-channel.*`, `admin/warehouse/*`, `admin/users/*`, `admin/documents/*`. When adding a new admin resource, create matching files in all four trees at the same relative path and register the route in the nearest `index.ts` (e.g. `src/core/tenant/routes/admin/index.ts`).

Controllers generally do NOT throw; they catch errors from the service layer and return `c.json({ success: false, message }, <status>)`. Services throw plain `Error`s with user-facing Spanish messages for expected failure cases (duplicate code, not found, etc.).

### Auth & permissions

- JWT payload shape (`src/utils/jwt.ts`): `{ userId, role, tenantId?, roleId?, permissions? }` where `permissions` is `Record<actionCode, subActionCode[]>` baked into the token at login.
- `authMiddleware` (`src/core/tenant/middleware/auth.middleware.ts`) verifies the Bearer token and sets `c.set('jwtPayload', payload)`. Master has an equivalent in `src/core/master/middleware/auth.middleware.ts`.
- Authorization helpers live in `src/utils/permissions.ts`:
  - `hasPermission(c, subActionCode)` — synchronous, checks permissions embedded in the JWT (fast, stale until re-login).
  - `hasPermissionLive(c, subActionCode)` — async, resolves fresh role/permissions from the DB via `buildPermissionsForUser`, cached ~90s per `(tenantId, userId)` in-memory. Call `invalidateUserPermissions(tenantId, userId)` after changing a user's role/permissions so it takes effect immediately.
  - `role === 'rol_admin'` always bypasses permission checks.
- `roleMiddleware(roles[])` and `requirePermission(actionCode, subActionCode)` in `auth.middleware.ts` are route-level guards built on the same JWT payload.

### Validation

Zod schemas + `@hono/zod-validator`'s `zValidator('json', schema)` are exported from each `*.validation.ts` file and used directly as route middleware (e.g. `routes.post('/', validateCreateX, createXController)`). A shared `validationHook` exists at `src/core/tenant/validations/hook.ts` (formats the first Zod issue into `{ status: false, message }`), but it is not wired into every `zValidator` call — check existing sibling files in the same folder before assuming it's applied by default.

### Multi-DB-server sharding (master)

Tenants are assigned to a `db-servers` entry (a physical/logical Postgres host). Creating a tenant checks the server is active and under `maxTenants`, creates the tenant + initial subscription in one transaction, and increments `currentTenants`; deleting a tenant decrements it. A server with tenants assigned cannot be deleted. See `docs/master/README.md` for the full flow diagram.

### Other infrastructure

- `src/redis/` — thin Redis-backed cache layer (currently just tenant lookups); `src/utils/redis.ts` holds the client. Redis outages are handled gracefully (catch-and-continue to DB) everywhere it's used — follow that pattern for new caches.
- `src/utils/r2.ts` / `src/utils/s3.ts` — Cloudflare R2 (S3-compatible) file storage.
- `src/utils/facturador-client.ts` / `src/utils/resolve-facturador-config.ts` — integration with an external SUNAT e-invoicing microservice (`FACTURADOR_URL` env var), used by the `admin/documents` / billing modules.
- `src/jobs/` — background jobs (e.g. token cleanup); currently disabled at boot (commented out in `src/index.ts`).
- Path alias `@/*` → `./src/*` (configured in `tsconfig.json`).

### Docs

`docs/admin/*.md`, `docs/master/*.md`, `docs/client/*.md` document individual resource APIs (request/response shapes) — check the matching doc before/after changing a resource's contract. `src/markdown/*.md` contains design notes, analyses, and roadmaps for larger features (units conversion, sales channels, warehouse/branches, frequent customers, etc.) — useful background when touching those areas, but may describe proposals rather than final/shipped behavior.
