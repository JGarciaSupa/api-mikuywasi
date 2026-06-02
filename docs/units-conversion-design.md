# Diseño: Unidades de Medida con Control de Factor de Conversión

## El problema en una línea

Los items hoy tienen `ledgerUnit` y `costUnit` como texto libre.
Eso genera errores (kg, KG, kilo…) y no hay control sobre el `conversionFactor`.

---

## Qué queremos lograr

| Situación actual | Con este diseño |
|---|---|
| Texto libre ("kg", "KG", "kilo") | Catálogo centralizado por tenant |
| Factor se ingresa a ciegas | UI muestra: `1 SACO = 50 KG` antes de guardar |
| Sin validación de dimensión | Bloquea mezclar peso con volumen |
| Conversiones inconsistentes | Factor sugerido automático desde `base_factor` |

---

## La tabla auxiliar: `measurement_units`

```
measurement_units
├── id          (PK)
├── code        "KG", "G", "LT", "ML", "UND", "SACO"
├── name        "Kilogramo", "Gramo", "Litro"...
├── dimension   "weight" | "volume" | "unit" | "length"
├── base_factor  ← clave: factor respecto a la unidad base de la dimensión
├── is_active
└── created_at / updated_at
```

### `base_factor` — la magia del catálogo

Permite sugerir el factor de conversión automáticamente cuando el usuario elige dos unidades.

Ejemplo de catálogo inicial (dimensión `weight`, unidad base = `KG`):

| code | name | dimension | base_factor |
|---|---|---|---|
| KG | Kilogramo | weight | 1.0 |
| G | Gramo | weight | 0.001 |
| LB | Libra | weight | 0.4536 |
| SACO_50 | Saco 50kg | weight | 50.0 |

> El sistema calcula: `factor sugerido = base_factor(contable) / base_factor(costo)`
> Si contable=SACO_50 y costo=KG: `50 / 1 = 50` → `1 SACO_50 = 50 KG` ✓

---

## Cambios en `items`

```
items
├── ledger_unit_id  → FK measurement_units.id  (antes: ledgerUnit string)
├── cost_unit_id    → FK measurement_units.id  (antes: costUnit string)
└── conversion_factor  ← se mantiene, pero ahora es asistido
```

**Regla semántica fija:**
> `conversion_factor = cuántas unidades de costo equivalen a 1 unidad contable`

Esto nunca cambia. La UI lo muestra siempre en ese orden para evitar confusión.

---

## El flujo de UX (el núcleo de la propuesta)

```
┌─────────────────────────────────────────────────┐
│  ITEM: Azúcar Rubia                             │
│                                                 │
│  Unidad contable: [ SACO_50    ▼ ]              │
│  Unidad de costo: [ KG         ▼ ]              │
│                                                 │
│  Factor de conversión:                          │
│  ┌─────────────────────────────────────────┐   │
│  │  1 SACO_50  =  [ 50 ]  KG              │   │
│  │              ↑ sugerido automático      │   │
│  └─────────────────────────────────────────┘   │
│                                                 │
│  [✓ Usar sugerido]   [✎ Editar manualmente]    │
│                                                 │
│  ⚠ Si editas: asegúrate que la equivalencia    │
│    sea correcta para tu unidad específica       │
└─────────────────────────────────────────────────┘
```

**Reglas de la UI:**
1. Dropdown de `costo` filtra solo unidades de la misma `dimension` que la contable.
2. Si ambas unidades tienen `base_factor`, el sistema sugiere el factor.
3. El usuario puede aceptar o editar manualmente (para casos especiales como sacos no estándar).
4. Si `ledgerUnit == costUnit`, se fuerza `factor = 1` y se deshabilita el campo.
5. Validación en tiempo real: factor debe ser > 0.

---

## Ejemplo práctico end-to-end

### Contexto
Restaurante que compra **aceite en galones** pero lo costea **por litro**.

### Paso 1: Catálogo de unidades (una vez, admin)

| code | name | dimension | base_factor |
|---|---|---|---|
| GL | Galón | volume | 3.785 |
| LT | Litro | volume | 1.0 |
| ML | Mililitro | volume | 0.001 |

### Paso 2: Crear item "Aceite Vegetal"

El usuario abre el formulario de item y llena:

```
Nombre:           Aceite Vegetal
Unidad contable:  GL  (lo compro por galón)
Unidad de costo:  LT  (lo costeo por litro)
```

El sistema detecta que GL tiene `base_factor=3.785` y LT tiene `base_factor=1.0`.

**Sugiere automáticamente:**
```
1 GL = 3.785 LT
```

El usuario ve ese texto, confirma que es correcto, acepta.

### Paso 3: Resultado guardado

```json
{
  "name": "Aceite Vegetal",
  "ledgerUnitId": "<id-GL>",
  "costUnitId": "<id-LT>",
  "conversionFactor": 3.785
}
```

### Paso 4: Cómo ayuda en operación

**En una orden de compra:** Entran 10 GL de aceite.
- El sistema sabe: `10 GL × 3.785 = 37.85 LT disponibles`

**En valorización de costo:** Precio de compra: $15 por galón.
- Sistema calcula costo por litro: `$15 / 3.785 = $3.96 / LT`

**Sin este diseño:** El usuario tendría que recordar/calcular esto manualmente cada vez.

### Paso 5: Caso de saco no estándar

El proveedor vende sacos de arroz de **47 kg** (no 50 kg estándar).

```
Unidad contable:  SACO  (sin base_factor definido, o base_factor genérico)
Unidad de costo:  KG
```

El sistema **no puede sugerir** porque SACO no tiene `base_factor` confiable.
Muestra:
```
1 SACO = [ _____ ] KG   ← usuario debe ingresar 47
```
El usuario escribe `47`, queda:
```
1 SACO = 47 KG
```

Esto es el control manual intencional — el usuario conoce su saco específico.

---

## Validaciones de negocio

| Regla | Mensaje de error |
|---|---|
| `ledgerUnitId` requerido | "Selecciona la unidad contable" |
| `costUnitId` requerido | "Selecciona la unidad de costo" |
| Misma `dimension` | "No puedes mezclar peso con volumen" |
| `conversionFactor > 0` | "El factor debe ser mayor a cero" |
| Unidades iguales → factor = 1 | (se fija automáticamente) |

---

## Endpoints mínimos necesarios

```
# Catálogo (nuevo)
GET  /warehouse/measurement-units          → lista activas
POST /warehouse/measurement-units          → crear unidad
PUT  /warehouse/measurement-units/:id      → editar/desactivar

# Items (modificados)
POST /warehouse/items
  body: { ledgerUnitId, costUnitId, conversionFactor, ... }

GET  /warehouse/items
  response incluye: ledgerUnitCode, costUnitCode (via join)
```

---

## Decisión clave a tomar antes de codear

**¿Manejamos `base_factor` en el catálogo para sugerencias automáticas?**

| Opción | Pro | Con |
|---|---|---|
| **A) Sí, con `base_factor`** | Conversión sugerida automática, menos errores | Requiere mantener catálogo correcto |
| **B) No, solo catálogo de nombres** | Más simple, más flexible | Factor siempre manual, más carga al usuario |

**Recomendación:** Opción A para dimensiones estándar (weight, volume), Opción B para unidades personalizadas (CAJA, SACO, UNIDAD de negocio).

---

## Plan de implementación (2 sprints)

### Sprint A — Backend + catálogo
- [ ] Crear tabla `measurement_units` + migración
- [ ] Seed catálogo inicial (KG, G, LT, ML, UND, GL, LB...)
- [ ] Agregar `ledger_unit_id`, `cost_unit_id` (nullable) en `items`
- [ ] Endpoints CRUD de unidades
- [ ] Validaciones en service de items
- [ ] Backfill: mapear strings existentes a IDs

### Sprint B — UI + retiro legacy
- [ ] Dropdowns en formulario de item (con filtro por dimensión)
- [ ] Cálculo y display del factor sugerido
- [ ] CRUD de catálogo de unidades (pantalla admin simple)
- [ ] Hacer `ledger_unit_id` / `cost_unit_id` NOT NULL
- [ ] Eliminar campos legacy `ledgerUnit`, `costUnit` string
