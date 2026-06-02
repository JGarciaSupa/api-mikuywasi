# Propuesta: Unidades de Medida Auxiliares + Factor de Conversión en Items

## Objetivo
Permitir que la gestión de unidades de medida en `items` sea más rápida y consistente usando una tabla auxiliar de unidades, y que el usuario pueda definir/controlar el factor de conversión de forma guiada en el mismo flujo de creación/edición del item.

## Problema Actual
- `ledgerUnit` y `costUnit` son texto libre.
- El `conversionFactor` se ingresa manualmente sin validaciones de consistencia entre unidades.
- Riesgo de errores humanos (`kg`, `KG`, `kilo`, etc.) y conversiones mal definidas.

## Resultado Esperado
- Selección de unidades desde catálogo (no texto libre).
- Conversión asistida en UI (`1 unidad contable = X unidades de costo`).
- Menos errores, mejor velocidad de registro, datos uniformes.

---

## Diseño Propuesto

## 1) Tabla auxiliar de unidades
`measurement_units` (catálogo global por tenant):

- `id` (PK)
- `code` (ej: `KG`, `G`, `LT`, `ML`, `UND`)
- `name` (ej: `Kilogramo`)
- `dimension` (ej: `weight`, `volume`, `unit`)
- `base_factor` (factor respecto a unidad base de su dimensión, opcional si queremos conversiones automáticas)
- `is_active`
- `created_at`
- `updated_at`

Notas:
- `dimension` evita conversiones inválidas (ej: peso a volumen).
- `code` único por tenant.

## 2) Cambios en `items`
Reemplazar campos string por FKs:
- `ledger_unit_id` -> FK `measurement_units.id`
- `cost_unit_id` -> FK `measurement_units.id`
- Mantener `conversion_factor` en `items` para control específico por item.

Opcional recomendado:
- Mantener también un `conversion_mode`:
  - `manual` (usuario define factor)
  - `auto` (se calcula desde `base_factor` de unidades)

## 3) Regla de conversión
Definir explícitamente:
- `conversion_factor = cuántas unidades de costo equivalen a 1 unidad contable`
- Ejemplo:
  - Contable: `KG`
  - Costo: `G`
  - `conversion_factor = 1000`

Esto debe verse textual en UI para evitar confusión.

---

## Flujo UX (rápido para usuario)

## Formulario Item (sección Unidades)
1. Selecciona `Unidad contable` (dropdown).
2. Selecciona `Unidad costo` (dropdown filtrado por misma dimensión).
3. Campo `Factor de conversión` con ayuda contextual:
   - Texto guía: `1 {contable} = [factor] {costo}`
4. Atajo:
   - Botón `Usar mismo valor` cuando contable y costo son iguales -> factor = 1.
5. Validación inmediata:
   - factor > 0
   - unidades compatibles por dimensión.

## Extra de productividad (opcional)
- Si ambas unidades tienen `base_factor`, sugerir factor automático.
- El usuario puede aceptar sugerencia o editar.

## Ejemplo de uso (end-to-end)

Caso: registrar el item `Azúcar rubia` para comprar por saco y costear por kilogramo.

1. Catálogo de unidades:
   - `SACO` (dimension: `weight`)
   - `KG` (dimension: `weight`)

2. En formulario de Item:
   - `Unidad contable`: `SACO`
   - `Unidad costo`: `KG`
   - `Factor de conversión`: `50`
   - Texto guía visible: `1 SACO = 50 KG`

3. Resultado guardado en `items`:
   - `ledger_unit_id` -> `SACO`
   - `cost_unit_id` -> `KG`
   - `conversion_factor` -> `50`

4. Cómo ayuda en operación:
   - Si entra 2 `SACO` en compra, el sistema puede interpretar equivalente de costo como `100 KG`.
   - Si el precio de compra llega por saco, se puede calcular costo por KG más rápido para valorización.

5. Validaciones del ejemplo:
   - Si usuario intenta `SACO` (weight) y `LT` (volume), UI bloquea por dimensión incompatible.
   - Si pone `0` o negativo en factor, UI/API rechaza.

---

## API propuesta

## Endpoints de catálogo de unidades
- `GET /warehouse/measurement-units`
- `POST /warehouse/measurement-units`
- `PUT /warehouse/measurement-units/:id`

## Items
- `POST /warehouse/items`:
  - recibe `ledgerUnitId`, `costUnitId`, `conversionFactor`
- `PUT /warehouse/items/:id` idem
- `GET /warehouse/items` devuelve:
  - IDs y opcionalmente `ledgerUnitCode`, `costUnitCode` para UI

---

## Validaciones de negocio
- `ledgerUnitId` y `costUnitId` obligatorios.
- Ambas unidades deben existir y estar activas.
- Deben ser de la misma `dimension`.
- `conversionFactor > 0`.
- Si `ledgerUnitId == costUnitId`, sugerir/forzar `conversionFactor = 1` (decisión de negocio).

---

## Plan de Migración (sin romper producción)

## Fase 1: Estructura
1. Crear tabla `measurement_units`.
2. Poblar catálogo inicial (`KG`, `G`, `LT`, `ML`, `UND`, etc.).
3. Agregar en `items`:
   - `ledger_unit_id` nullable
   - `cost_unit_id` nullable

## Fase 2: Backfill
1. Mapear valores existentes de `ledgerUnit` y `costUnit` texto -> IDs.
2. Completar `ledger_unit_id` y `cost_unit_id`.
3. Revisar items no mapeables (log/manual fix).

## Fase 3: Endurecer
1. Hacer `ledger_unit_id` y `cost_unit_id` NOT NULL.
2. Actualizar servicios/backend/frontend para usar IDs.
3. Eliminar campos legacy `ledgerUnit` y `costUnit` texto (cuando todo esté estable).

---

## Impacto Técnico

## Backend
- Schema + migraciones nuevas.
- `catalog.service` y validaciones de items.
- Endpoints nuevos para catálogo de unidades.
- Ajustar lecturas donde se muestra unidad (`short code`) via join o mapeo.

## Frontend
- Dropdowns de unidades en Items.
- Gestión CRUD de catálogo de unidades (pantalla simple).
- Ajuste de tablas/documentos que leen unidades (mostrar `code`).

## Reportes/Movimientos
- Requiere que en respuestas de movimientos se devuelva `unit code` desde FK.

---

## Riesgos y Mitigaciones
- Riesgo: unidades históricas inconsistentes.
  - Mitigación: tabla de normalización en migración + reporte de no mapeados.
- Riesgo: usuarios confunden dirección del factor.
  - Mitigación: ayuda visual fija (`1 contable = X costo`) + ejemplos.
- Riesgo: corte por cambios de frontend/backend desincronizados.
  - Mitigación: despliegue por fases y compatibilidad temporal con campos legacy.

---

## Recomendación de Implementación
Implementar en 2 sprints cortos:
1. **Sprint A**: catálogo de unidades + backend con compatibilidad.
2. **Sprint B**: UI completa + retiro de legacy.

Si te parece, el siguiente paso puede ser aterrizar esto en tareas técnicas concretas (checklist por archivo/migración) y empezar por migraciones backend.
