# GastroPro 360 — Flujos del Sistema de Almacenes e Inventarios

**Empresa:** Estrategia Gastronómica A & G S.A.C.  
**Sistema:** Almacenes e Inventarios (Mikuy Wasi)  
**Versión:** Manual Completo · Ingeniería Inversa + API multi-tenant  
**Esquema Drizzle:** `src/db/tenant/schema.ts`  
**Implementación API:** `src/core/tenant/routes/admin/warehouse/`

---

## Índice (reorganizado)

### A — Arquitectura e integración API

- [Contexto multi-tenant](#contexto-multi-tenant)
- [Equivalencia tablas y campos (ES → PostgreSQL)](#equivalencia-tablas-y-campos-es--postgresql)
- [Estados de documentos (ES ↔ API)](#estados-de-documentos-es--api)
- [Endpoints REST por flujo](#endpoints-rest-por-flujo)

### B — Flujos operativos de almacén

1. [Flujo 1 — Ingreso de Documentos (Compras)](#flujo-1--ingreso-de-documentos-compras)
2. [Flujo 2 — Requerimientos](#flujo-2--requerimientos-almacén-central--subalmacén)
3. [Flujo 3 — Transferencias entre Subalmacenes](#flujo-3--transferencias-entre-subalmacenes)
4. [Flujo 4 — Salidas (Bajas de Stock)](#flujo-4--salidas-bajas-de-stock)
5. [Flujo 5 — Porcionamiento](#flujo-5--porcionamiento)
6. [Flujo 6 — Ajuste de Inventarios (Cierre)](#flujo-6--ajuste-de-inventarios-cierre)
7. [Flujo 7 — Ciclo Diario del Almacenero](#flujo-7--ciclo-diario-del-almacenero)

### C — Integración menú ↔ inventario

8. [Flujo 8 — Carga de Recetas](#flujo-8--carga-de-recetas)
9. [Flujo 9 — Descarga de Venta](#flujo-9--descarga-de-venta-descarga-por-receta)
10. [Flujo 10 — Control de Vencimientos y Lotes](#flujo-10--control-de-vencimientos-y-lotes)

### D — Reglas, soporte y referencia

11. [Reglas de Negocio Transversales](#reglas-de-negocio-transversales)
12. [Tablas afectadas por flujo](#tablas-afectadas-por-flujo)
13. [Tablas de Soporte del Sistema](#tablas-de-soporte-del-sistema)
14. [Sistema de Auditoría](#sistema-de-auditoría)
15. [Comparativa con Sistemas a Mayor Escala](#comparativa-con-sistemas-a-mayor-escala)

---

## Contexto multi-tenant

Cada restaurante tiene **su propia base de datos** con el esquema completo de almacenes. El patrón es el de `IMPLEMENTATION_SUMMARY.md`:

| Paso | Componente |
|------|------------|
| 1 | `tenantContextMiddleware` resuelve `tenantId` (`?tenantId=` o header `X-Tenant-ID`) |
| 2 | Servicios usan `getTenantDb()` — sin filtrar por `tenant_id` en tablas |
| 3 | Rutas admin bajo `/api/admin/warehouse/*` con JWT + rol `admin` |

Documentación detallada de endpoints: [`docs/admin/warehouse.md`](docs/admin/warehouse.md).

---

## Equivalencia tablas y campos (ES → PostgreSQL)

En este documento los **nombres en español** son la referencia funcional (GastroPro 360). En la API y Drizzle se usan los nombres de la columna derecha.

| Documento (ES) | Tabla PostgreSQL | Export Drizzle |
|----------------|------------------|----------------|
| `documentos` | `purchase_documents` | `purchaseDocuments` |
| `documento_detalle` | `purchase_document_lines` | `purchaseDocumentLines` |
| `proveedores` | `suppliers` | `suppliers` |
| `requerimientos` | `requisitions` | `requisitions` |
| `requerimiento_detalle` | `requisition_lines` | `requisitionLines` |
| `transferencias` | `stock_transfers` | `stockTransfers` |
| `transferencia_detalle` | `stock_transfer_lines` | `stockTransferLines` |
| `salidas` | `stock_exits` | `stockExits` |
| `salida_detalle` | `stock_exit_lines` | `stockExitLines` |
| `porcionamientos` | `portionings` | `portionings` |
| `porcionamiento_detalle` | `portioning_lines` | `portioningLines` |
| `ajuste_inventarios` | `inventory_adjustments` | `inventoryAdjustments` |
| `ajuste_detalle` | `adjustment_lines` | `adjustmentLines` |
| `articulos` | `items` | `items` |
| `familias` / `subfamilias` | `item_families` / `item_subfamilies` | `itemFamilies` / `itemSubfamilies` |
| `areas` | `storage_areas` | `storageAreas` |
| `articulos_areas` | `item_area_assignments` | `itemAreaAssignments` |
| `kardex_central` | `main_ledger` | `mainLedger` |
| `kardex_subalmacen` | `area_ledger` | `areaLedger` |
| `pivot_stock_por_area` | `stock_snapshot` | `stockSnapshot` |
| `pivot_mermas` | `waste_log` | `wasteLog` |
| `recetas` | `recipes` | `recipes` |
| `receta_detalle` | `recipe_lines` | `recipeLines` |
| `descarga_venta` | `sales_discharge` | `salesDischarge` |
| `descarga_venta_detalle` | `sales_discharge_lines` | `salesDischargeLines` |
| `lotes` | `batches` | `batches` |
| `pivot_auditoria` | `audit_log` | `auditLog` |
| `configuracion_sistema` | `system_settings` | `systemSettings` |
| `usuarios` | `users` | `users` |

### Campos frecuentes `articulos` → `items`

| ES (manual) | Columna API |
|-------------|-------------|
| `codigo` | `code` |
| `descripcion_completa` | `full_description` |
| `descripcion_corta` | `short_description` |
| `precio_promedio` | `avg_price` |
| `stock_actual` | `current_stock` |
| `stock_minimo` | `min_stock` |
| `dias_vencimiento` | `expiry_days` |
| `porcionable` | `portionable` |
| `descarga_por_receta` | `recipe_discharge` |
| `unidad_kardex` | `ledger_unit` |
| `unidad_costos` | `cost_unit` |
| `factor_equivalencia` | `conversion_factor` |

---

## Estados de documentos (ES ↔ API)

| GastroPro (ES) | Valor API (`status`) | Afecta stock |
|----------------|----------------------|:------------:|
| GENERADO | `draft` | No |
| PROCESADO | `processed` | Sí |
| ANULADO | `voided` | No / revierte según módulo |
| ABIERTO (ajuste) | `open` | No |
| CERRADO (ajuste) | `closed` | Sí |

Operaciones de auditoría API: `INSERT`, `UPDATE`, `DELETE`, `PROCESS`, `VOID`, `ADJUST`.

---

## Endpoints REST por flujo

**Base:** `GET|POST /api/admin/warehouse/...`  
**Headers:** `Authorization: Bearer <token>`, `X-Tenant-ID: <id>` (o `?tenantId=`)

| Flujo | Método | Ruta |
|:-----:|--------|------|
| 1 Compras | `POST` | `/purchase-documents` |
| 1 | `POST` | `/purchase-documents/:id/process` |
| 2 Requerimientos | `POST` | `/requisitions` → `/requisitions/:id/process` |
| 3 Transferencias | `POST` | `/stock-transfers` → `.../process` |
| 4 Salidas | `POST` | `/stock-exits` → `.../process` |
| 5 Porcionamiento | `POST` | `/portionings` → `.../process` |
| 6 Ajuste | `POST` | `/inventory-adjustments/open` |
| 6 | `PATCH` | `/inventory-adjustments/:id/lines` |
| 6 | `POST` | `/inventory-adjustments/:id/close` |
| 8 Recetas | `POST` | `/recipes` |
| 9 Descarga venta | `GET` | `/sales-discharge/preview/:orderId` |
| 9 | `POST` | `/sales-discharge` → `.../process` |
| 9 (auto) | — | Al marcar pedido `completed`, intenta descarga automática |
| 10 Lotes | `GET` | `/batches` · `POST /batches/refresh-statuses` |
| Kardex | `GET` | `/kardex/area/:areaId` |
| Stock | `GET` | `/stock-snapshot` |
| Maestros | `GET/POST` | `/families`, `/areas`, `/suppliers`, `/items`, … |

---


## Flujo 1 — Ingreso de Documentos (Compras)

**Descripción:** Registra facturas, boletas o guías de remisión de proveedores para incrementar stock en el almacén central (o subalmacén directo).

**Tablas involucradas:** `documentos`, `documento_detalle`, `kardex_central`, `kardex_subalmacen`, `articulos` (precio_promedio, stock_actual), `pivot_stock_por_area`, `requerimientos` (auto-generado si aplica)

### Pasos

```
1. INICIO
   └─ El almacenero recibe el comprobante físico del proveedor.

2. SELECCIÓN DE DOCUMENTO
   ├─ Ir a: Documentos → Agregar
   ├─ Seleccionar tipo: Factura | Boleta | Guía de Remisión
   └─ Ingresar: Serie + Correlativo del comprobante fiscal

3. REGISTRO DE PROVEEDOR
   ├─ Buscar proveedor en el listado (binoculares)
   ├─ [Si no existe] → Agregar nuevo proveedor con campos obligatorios
   │   └─ Si faltan datos (teléfono/email) → ingresar guion (-)
   └─ Confirmar y continuar

4. CABECERA DEL DOCUMENTO
   ├─ Fecha de emisión: la del comprobante físico
   ├─ Fecha de ingreso: fecha actual del sistema
   ├─ Programación de pago: fecha de cancelación (si es a crédito)
   ├─ Área destino:
   │   ├─ [Por defecto] → Almacén Central
   │   └─ [Directo a subalmacén] → ⚠ genera requerimiento automático
   ├─ Tipo de ingreso: Mercadería | Servicio | Activo Fijo
   └─ Glosa: resumen breve (ej: "carnes", "verduras", "frutas")

5. REGISTRO DE ARTÍCULOS (por cada línea del comprobante)
   ├─ Buscar artículo (binoculares o nombre)
   ├─ Ingresar cantidad según unidad de kardex (ej: kilos)
   ├─ Ingresar total según documento
   ├─ Marcar si incluye IGV (18%)
   └─ Presionar GRABAR → repetir para todos los artículos

6. AJUSTES OPCIONALES
   ├─ Descuentos:
   │   ├─ Por artículo (a nivel de línea)
   │   └─ Al total del documento (monto o porcentaje)
   │       ⚠ No combinar ambos niveles
   ├─ IGV:
   │   ├─ Precio neto → sistema calcula IGV automáticamente
   │   └─ Precio con IGV → usar opción "Impuestos" para descontar
   └─ Redondeo: ajustar decimales si el total no coincide exactamente

7. VALIDACIÓN
   ├─ Comparar totales del sistema vs comprobante físico
   └─ [Si hay diferencias] → Modificar cantidad/precio o Eliminar artículo

8. PROCESAR DOCUMENTO
   ├─ Estado cambia: GENERADO → PROCESADO
   ├─ Sistema registra en kardex_central o kardex_subalmacen
   ├─ Sistema actualiza precio_promedio del artículo (método PP):
   │   PP_nuevo = (stock_anterior × PP_anterior + cantidad × precio_unitario)
   │              ÷ (stock_anterior + cantidad)
   └─ Sistema actualiza stock_actual en articulos y pivot_stock_por_area

9. [Si área destino = subalmacén directo]
   └─ Sistema genera REQUERIMIENTO AUTOMÁTICO con referencia al documento

10. FIN — Resultado visible en Maestro de Artículos:
    ├─ Stock actualizado
    └─ Precio Promedio (PP) recalculado
```

### Estados del documento

| Estado | Puede modificarse | Afecta stock |
|--------|:-----------------:|:------------:|
| GENERADO | ✅ Sí | ❌ No |
| PROCESADO | ❌ No (solo desprocessar) | ✅ Sí |
| ANULADO | ❌ No | ❌ Revierte |

### Reglas clave

- Un documento solo puede anularse mientras esté en estado **GENERADO**.
- Si el documento ingresa directo a un **subalmacén**, el almacén central **no tendrá stock** ni generará valorizados para ese artículo; en su lugar se crea un requerimiento automático.
- No se puede aplicar descuento al total si ya se aplicó a nivel de artículo, y viceversa.

---

## Flujo 2 — Requerimientos (Almacén Central → Subalmacén)

**Descripción:** Proceso por el cual un subalmacén solicita stock al almacén central. El central registra lo que efectivamente entrega.

**Tablas involucradas:** `requerimientos`, `requerimiento_detalle`, `kardex_central`, `kardex_subalmacen`, `articulos_areas`, `pivot_stock_por_area`

### Precondición

> El artículo **debe tener asignada el área solicitante** en `articulos_areas`. Sin esta asignación, el artículo no aparece en el buscador del requerimiento.

### Pasos

```
1. INICIO
   └─ Encargado del subalmacén (o almacenero) decide qué artículos necesita.

2. CREAR REQUERIMIENTO
   ├─ Ir a: Requerimientos → Agregar
   └─ El sistema asigna número correlativo automático

3. SELECCIONAR ÁREA SOLICITANTE
   └─ Elegir el subalmacén que solicita (Cocina, Bar, Pastelería, etc.)

4. BÚSQUEDA Y CARGA DE ARTÍCULOS
   ├─ Agregar artículo → buscar con binoculares o nombre
   ├─ El sistema muestra:
   │   ├─ Stock disponible en almacén central
   │   └─ Solo artículos asignados a ese subalmacén
   ├─ Ingresar "Cantidad pedida" (lo que necesita el subalmacén)
   ├─ Ingresar "Cantidad atendida" (lo que el central entregará efectivamente)
   ├─ Seleccionar unidad: kardex (kg, lt, unid) o costos (g, ml) con botón "="
   └─ GRABAR artículo → repetir para todos los insumos necesarios

5. GRABAR REQUERIMIENTO
   └─ Estado: GENERADO

6. PROCESAR REQUERIMIENTO
   ├─ Estado cambia: GENERADO → PROCESADO
   ├─ Sistema registra en kardex_central: SALIDA por cada artículo atendido
   ├─ Sistema registra en kardex_subalmacen: INGRESO por cada artículo
   └─ Sistema actualiza pivot_stock_por_area para ambas áreas

7. [OPCIONAL] Generar Transferencia desde el requerimiento
   ├─ Botón "Transferir" dentro del requerimiento procesado
   ├─ Seleccionar destino (almacén central para devolución, u otro subalmacén)
   └─ La transferencia queda en estado GENERADO para revisión y posterior procesado

8. FIN — Validar:
   ├─ Subalmacén: recibió el stock (kardex_subalmacen muestra ingreso)
   └─ Almacén central: descontó la salida (kardex_central muestra salida)
```

### Diferencias cantidad pedida vs atendida

| Escenario | cantidad_pedida | cantidad_atendida | cantidad_pendiente |
|-----------|:--------------:|:-----------------:|:-----------------:|
| Atención completa | 10 kg | 10 kg | 0 kg |
| Atención parcial | 10 kg | 6 kg | 4 kg |
| Sin stock | 10 kg | 0 kg | 10 kg |

### Requerimiento automático

Cuando un documento ingresa **directo a un subalmacén**, el sistema genera automáticamente un requerimiento con:
- **Área:** el subalmacén destino del documento
- **Referencia:** número del documento (ej: `F00007000000089`)
- **Estado:** PROCESADO (ya aplicado)

---

## Flujo 3 — Transferencias entre Subalmacenes

**Descripción:** Traslado de stock de un subalmacén a otro, o devolución de un subalmacén al almacén central.

**Tablas involucradas:** `transferencias`, `transferencia_detalle`, `kardex_subalmacen`, `articulos_areas`

### Precondición

> El artículo debe tener **ambas áreas** (origen y destino) asignadas en `articulos_areas`.

### Pasos — Vía módulo Transferencias

```
1. INICIO
   └─ Necesidad detectada: excedente en un área / déficit en otra.

2. CREAR TRANSFERENCIA
   ├─ Ir a: Procesos → Almacén → Transferencias → Agregar
   ├─ Seleccionar Área de Origen (subalmacén que cede stock)
   └─ Seleccionar Área de Destino (subalmacén o almacén central)

3. AGREGAR ARTÍCULOS
   ├─ Botón Agregar → binoculares o escribir nombre
   ├─ Sistema muestra stock disponible en área de origen
   ├─ Ingresar cantidad a transferir:
   │   ├─ En unidad de kardex (kg, lt, unid)
   │   └─ En unidad de costos (g, ml) → botón "="
   └─ GRABAR artículo → repetir para más insumos

4. GRABAR TRANSFERENCIA
   └─ Estado: GENERADO

5. VALIDAR
   └─ Revisar que artículos y cantidades sean correctas

6. PROCESAR TRANSFERENCIA
   ├─ Estado cambia: GENERADO → PROCESADO
   ├─ Área origen → kardex_subalmacen: SALIDA
   └─ Área destino → kardex_subalmacen: INGRESO

7. FIN — Validar en kardex de cada área:
   ├─ Origen: stock reducido (ej: Cocina 6 kg → 4 kg)
   └─ Destino: stock incrementado (ej: Antojitos 0 kg → 2 kg)
```

### Pasos — Vía módulo Requerimientos (alternativo)

```
1. Abrir requerimiento ya PROCESADO
2. Seleccionar botón "Transferir"
3. Indicar destino: almacén central (devolución) u otro subalmacén
4. Sistema genera transferencia en estado GENERADO
5. Ingresar a la transferencia → modificar cantidades si es necesario
6. GRABAR → PROCESAR
7. Validar en ambos kardex
```

### Casos de uso

| Caso | Área Origen | Área Destino |
|------|------------|--------------|
| Traslado entre subalmacenes | Cocina | Antojitos y Sandwich |
| Devolución al central | Bar | Almacén Central |
| Préstamo temporal | Pastelería | Cocina |

---

## Flujo 4 — Salidas (Bajas de Stock)

**Descripción:** Registra pérdidas operativas que reducen el stock sin generar un ingreso equivalente. Deben realizarse **diariamente**.

**Tablas involucradas:** `salidas`, `salida_detalle`, `kardex_subalmacen`, `pivot_stock_por_area`

### Tipos de salida

| Concepto | Ejemplos |
|----------|---------|
| Bajas | Producto vencido, rotura de botellas |
| Consumo | Comida de personal, degustaciones |
| Control de calidad | Muestras enviadas a análisis |
| Prueba de cocina | Pruebas de nuevas recetas |
| Limpieza frutas | Residuos de limpieza no porcionados |
| Gasto | Insumos de limpieza usados directamente |
| Devolución cliente | Platos devueltos no reprocesables |

### Pasos

```
1. INICIO
   └─ Detectar pérdida/baja durante la operación (turno mañana o noche).

2. ACCEDER AL MÓDULO
   └─ Ir a: Salidas (ícono de fecha en la barra superior)

3. CREAR SALIDA
   ├─ Botón Agregar → abre ventana emergente
   ├─ Seleccionar Área donde ocurrió la baja (Bar, Cocina, etc.)
   ├─ Seleccionar Tipo de Salida (Bajas, Consumo, etc.)
   └─ Definir Concepto / Motivo específico

4. AGREGAR PRODUCTOS
   ├─ Buscar artículo (escribir nombre → aparece con stock actual del área)
   ├─ ⚠ Si el stock es 0: verificar con almacenero la información
   ├─ Ingresar cantidad a dar de baja
   └─ GRABAR → repetir para todos los productos

5. GRABAR LA SALIDA

6. REVISAR
   └─ Verificar artículos y cantidades antes de procesar

7. PROCESAR
   ├─ Estado: GENERADO → PROCESADO
   ├─ Sistema descuenta del kardex_subalmacen del área
   └─ Sistema actualiza pivot_stock_por_area

8. FIN — El stock real refleja la baja registrada.
```

### Buenas prácticas

- Las salidas deben registrarse **en el turno en que ocurren**, no al final del día.
- Una rotura de botella en Bar se registra desde el área **Bar**, no desde almacén central.
- Si no se registran las salidas, el inventario se **inflará** artificialmente y los costos no serán reales.

---

## Flujo 5 — Porcionamiento

**Descripción:** Transforma un artículo en uno o varios artículos derivados, registrando la merma generada. El precio promedio del derivado se recalcula automáticamente.

**Tablas involucradas:** `porcionamientos`, `porcionamiento_detalle`, `kardex_subalmacen`, `articulos` (precio_promedio), `pivot_mermas`

### Tipos de porcionamiento

| Tipo | Ejemplo | Efecto en stock |
|------|---------|----------------|
| Con merma | Piña entera → Pulpa + Cáscara | Artículo origen baja; derivado sube; merma registrada |
| Cambio de unidad | Limón (kg) → Zumo (litros) | Artículo origen baja; derivado en nueva unidad sube |
| Múltiple | Pollo (kg) → Presa + Ala + Pechuga + Menudencia | Un origen; múltiples derivados |

### Precondiciones

> 1. El artículo a porcionar debe tener **`porcionable = TRUE`** en el maestro de artículos.  
> 2. El artículo debe estar **asignado al área** donde se realiza el porcionamiento.

### Pasos

```
1. INICIO
   └─ Recibir insumos a procesar (frutas, verduras, carnes, etc.)

2. ACCEDER AL MÓDULO
   └─ Ir a: Porcionamiento (ícono en barra superior)

3. CREAR PORCIONAMIENTO
   └─ Botón Agregar

4. SELECCIONAR ÁREA Y ARTÍCULO
   ├─ Seleccionar área (ej: Jugos)
   ├─ Desactivar "Cargar solo plantillas" para ver todos los artículos del área
   ├─ Seleccionar artículo origen (ej: Papaya Fruta)
   └─ Sistema carga automáticamente el stock total disponible en el área

5. AJUSTAR CANTIDAD A PORCIONAR
   └─ Modificar según el stock real que se va a porcionar hoy

6. AGREGAR ARTÍCULO DERIVADO
   ├─ Botón Agregar artículo → buscar con binoculares o escribir nombre
   ├─ Campo "N porciones": cantidad resultante del derivado (en unidad kardex)
   ├─ Campo "Equivalen a": cantidad del origen usado para obtener esa cantidad
   └─ GRABAR artículo

7. [Si hay más derivados]
   └─ Repetir paso 6 para cada artículo derivado adicional

8. GRABAR EL PORCIONAMIENTO COMPLETO

9. SISTEMA CALCULA MERMA
   ├─ Consulta: "¿Quedan X unidades sin porcionar, ¿considerar como merma?"
   ├─ Responder SÍ → sistema registra la merma y muestra porcentaje
   └─ Responder NO → las unidades restantes siguen en stock como están

10. PROCESAR
    ├─ Estado: GENERADO → PROCESADO
    ├─ Artículo origen: baja en kardex_subalmacen del área
    ├─ Artículo(s) derivado(s): sube en kardex_subalmacen del área
    ├─ Precio Promedio del derivado: se recalcula (mejor costeo de recetas)
    └─ Merma registrada en pivot_mermas

11. FIN — Validar:
    ├─ Stock de papaya fruta: redujo 10 kg
    ├─ Stock de papaya limpia: aumentó 8 kg
    ├─ Merma: 2 kg (20%)
    └─ PP del derivado: actualizado
```

### Reporte de mermas

Ruta: `Reportes → Mermas`

El reporte muestra por área y período:
- Cantidad utilizada para porcionamiento
- Cantidad de merma obtenida
- Valor de la merma (merma × precio promedio)
- Porcentaje de merma sobre el total utilizado

### Frutas y verduras recomendadas para porcionar

Palta · Lechuga · Choclo (si es entero) · Brócoli · Arveja · Papaya · Espinaca

---

## Flujo 6 — Ajuste de Inventarios (Cierre)

**Descripción:** Sincroniza el stock del sistema con el conteo físico real. Es el proceso de cierre de inventario por área.

**Tablas involucradas:** `ajuste_inventarios`, `ajuste_detalle`, `articulos`, `pivot_stock_por_area`, `kardex_central`, `kardex_subalmacen`

### Precondiciones críticas — OBLIGATORIAS antes de iniciar

> ⚠ **El ajuste no puede comenzar si existen documentos/requerimientos en estado GENERADO.**  
> Todo movimiento debe estar en estado **PROCESADO**:
>
> 1. ✅ Ingreso de documentos → PROCESADO  
> 2. ✅ Requerimientos → PROCESADO  
> 3. ✅ Transferencias → PROCESADO  
> 4. ✅ Salidas → PROCESADO  
> 5. ✅ Porcionamientos → PROCESADO  
> 6. ✅ Descarga de venta → PROCESADO

### Pasos

```
1. VERIFICAR PRECONDICIONES
   └─ Confirmar que todos los movimientos del período están PROCESADOS.

2. ACCEDER AL MÓDULO
   └─ Ir a: Procesos → Contables → Cierre y Ajuste de Inventarios → Nuevo

3. SELECCIONAR ÁREA
   ├─ Elegir el subalmacén o almacén central a ajustar
   └─ ⚠ El ajuste afecta SOLO el área seleccionada

4. CONFIRMAR APERTURA
   ├─ Clic en Aceptar
   └─ ⚠ Una vez iniciado, no pueden ingresarse nuevos movimientos en esa área
           hasta que el ajuste sea cerrado

5. SISTEMA GENERA EL AJUSTE
   └─ Se crea registro en ajuste_inventarios con estado ABIERTO

6. INGRESAR AL CAMPO "AJUSTE"
   └─ El sistema lista todos los artículos del área con:
       ├─ Columna "Al cierre": stock registrado en el sistema
       ├─ Columna "Stock Final": campo editable (conteo físico real)
       └─ Columna "Ajuste": calculado automáticamente = Stock Final - Al Cierre

7. INGRESAR CONTEO FÍSICO
   ├─ Para cada artículo, ingresar la cantidad física encontrada en "Stock Final"
   ├─ El sistema calcula automáticamente la diferencia (Ajuste)
   │   ├─ Ajuste POSITIVO: se encontró más de lo que dice el sistema
   │   └─ Ajuste NEGATIVO: se encontró menos de lo que dice el sistema
   └─ Artículos con Stock Final = 0 y sistema = 0 → no requieren cambio

8. FINALIZAR AJUSTE DE INVENTARIO
   ├─ Botón: "Finalizar Ajuste de Inventario"
   ├─ Sistema actualiza stock_actual de cada artículo
   ├─ Sistema registra los movimientos de ajuste en kardex
   ├─ Sistema actualiza pivot_stock_por_area
   └─ Estado del ajuste cambia a: CERRADO

9. FIN — El área queda con stock sincronizado y el sistema puede
   recibir nuevos movimientos.
```

### Interpretación del campo Ajuste

| Al Cierre (sistema) | Stock Final (físico) | Ajuste | Interpretación |
|:-------------------:|:--------------------:|:------:|----------------|
| 10 kg | 10 kg | 0 | Sin diferencia |
| 10 kg | 8 kg | -2 | Pérdida no registrada |
| 10 kg | 12 kg | +2 | Ingreso no registrado |
| 5 kg | 0 kg | -5 | Stock no disponible físicamente |

### Columnas de la ventana de ajuste

| Columna | Origen | Editable |
|---------|--------|:--------:|
| Al cierre | Calculado por el sistema al abrir el ajuste | ❌ No |
| Ajuste | Calculado automáticamente (Stock Final - Al Cierre) | ❌ No |
| Stock Final | Ingresado por el almacenero del conteo físico | ✅ Sí |

---

## Flujo 7 — Ciclo Diario del Almacenero

**Descripción:** Secuencia completa de actividades que el almacenero debe ejecutar cada día.

```
┌─────────────────────────────────────────────────────────────┐
│                    TURNO MAÑANA (8:00 AM)                   │
├─────────────────────────────────────────────────────────────┤
│ 1. ABRIR ALMACÉN                                            │
│    └─ Verificar condiciones físicas (temperatura, orden)    │
│                                                             │
│ 2. INVENTARIO INICIAL (primera hora)                        │
│    └─ Revisar stocks del día anterior vs físico             │
│                                                             │
│ 3. PREPARAR RECEPCIÓN                                       │
│    ├─ Conocer qué proveedores llegan hoy                    │
│    └─ Preparar área de descarga                             │
│                                                             │
│ 4. RECEPCIÓN DE MERCADERÍAS                                 │
│    ├─ Verificar empaque, calidad y vencimiento              │
│    ├─ Revisar con guía de remisión y pedido en mano         │
│    ├─ [Problema] → Devolver, ajustar cantidad, notificar    │
│    └─ Sellar guías y archivar                               │
│                                                             │
│ 5. REGISTRAR DOCUMENTOS EN SISTEMA                          │
│    └─ Ingreso de documentos (Flujo 1)                       │
│                                                             │
│ 6. ALMACENAR PRODUCTOS                                      │
│    ├─ Guardar inmediatamente con FIFO                       │
│    ├─ Etiquetar (fecha ingreso / vencimiento)               │
│    └─ Porcionar si aplica (Flujo 5)                         │
│                                                             │
│ 7. DESPACHAR REQUERIMIENTOS                                 │
│    ├─ Atender pedidos de subalmacenes (Flujo 2)             │
│    └─ Preparar paquetes para turno noche                    │
├─────────────────────────────────────────────────────────────┤
│                    OPERACIÓN CONTINUA                       │
├─────────────────────────────────────────────────────────────┤
│ 8. REGISTRAR SALIDAS DEL DÍA                                │
│    └─ Mermas, roturas, consumos (Flujo 4)                   │
│                                                             │
│ 9. GESTIONAR TRANSFERENCIAS SI APLICA                       │
│    └─ Entre subalmacenes (Flujo 3)                          │
├─────────────────────────────────────────────────────────────┤
│                    CIERRE DE JORNADA                        │
├─────────────────────────────────────────────────────────────┤
│ 10. REVISIÓN DE STOCKS                                      │
│     ├─ Revisar movimientos y stocks del día                 │
│     └─ Identificar artículos próximos a agotarse            │
│                                                             │
│ 11. PEDIDO PARA SIGUIENTE ENTREGA                           │
│     ├─ Comparar stock vs pares establecidos                 │
│     └─ Generar solicitudes a logística/compras              │
│                                                             │
│ 12. CERRAR ALMACÉN CON LLAVE                                │
│     └─ Movimientos fuera de horario → autorización gerente  │
└─────────────────────────────────────────────────────────────┘
```

### Horarios de atención

| Turno | Horario | Acción principal |
|-------|---------|-----------------|
| Mañana | 08:00 – 12:30 | Recepción, ingreso de docs, requerimientos |
| Tarde/Noche | 18:00 – 19:00 | Despacho turno noche |
| Fuera de horario | Requiere autorización del gerente | Movimientos de emergencia |

---

## Flujo 8 — Carga de Recetas

**Descripción:** Vincula un producto del menú (plato) con los ingredientes del almacén que se consumen al prepararlo. Es el puente entre el sistema de ventas y el sistema de inventario. Sin receta cargada, `descarga_por_receta` no puede ejecutarse.

**Tablas involucradas:** `recetas`, `receta_detalle`, `articulos`, `areas`, `productos` (FK a tabla de productos del tenant)

### Precondiciones

> 1. El producto debe existir en el catálogo del restaurante (`products`).  
> 2. Todos los ingredientes deben estar registrados como artículos (`articulos`) con `activo = TRUE`.  
> 3. Cada ingrediente debe estar asignado al área de producción en `articulos_areas`.  
> 4. El artículo que usará descarga por receta debe tener `descarga_por_receta = TRUE`.

### Pasos

```
1. INICIO
   └─ Administrador/Chef crea o edita un plato del menú.

2. ACCEDER AL MÓDULO DE RECETAS
   └─ Ir a: Menú → Platos → Seleccionar producto → Receta

3. CREAR CABECERA DE RECETA
   ├─ Nombre: normalmente igual al nombre del plato (o nombre de sub-receta)
   ├─ Porciones: cuántas unidades produce esta receta (default: 1)
   ├─ Rendimiento (%): merma esperada en producción (ej: 85%)
   └─ Área de producción: subalmacén donde se prepara (ej: Cocina)

4. AGREGAR INGREDIENTES (por cada insumo)
   ├─ Buscar artículo del almacén (binoculares o nombre)
   ├─ Ingresar cantidad por porción
   ├─ Seleccionar unidad: kardex (kg, lt, unid) o costos (g, ml)
   ├─ Marcar si es opcional (guarniciones, salsas a elección)
   └─ GRABAR ingrediente → repetir para todos

5. VALIDACIÓN AUTOMÁTICA DEL SISTEMA
   ├─ Calcula costo de receta = SUM(cantidad × precio_promedio del artículo)
   ├─ Muestra rentabilidad = precio_venta − costo_receta
   └─ Alerta si algún ingrediente tiene stock = 0 en el área de producción

6. GUARDAR RECETA
   └─ Estado: ACTIVA

7. FIN — La receta queda disponible para Descarga de Venta (Flujo 9).
```

### Tipos de receta

| Tipo | Ejemplo | Nota |
|------|---------|------|
| Estándar | Lomo Saltado → carne + arroz + papas | 1 producto → 1 receta |
| Sub-receta | Salsa Huancaína (ingrediente en otros platos) | Artículo derivado, no producto del menú |
| Con merma | Ceviche → pescado crudo (con % rendimiento) | Sistema ajusta cantidad real a deducir |
| Con variantes | Pollo a la brasa → artículo varía por tamaño | Una receta por variante del plato |

### Columnas clave de `receta_detalle`

| Columna | Descripción |
|---------|-------------|
| `cantidad` | Cantidad del ingrediente por porción |
| `es_costos` | `TRUE` = la cantidad está en `unidad_costos` (gramos/ml); `FALSE` = en `unidad_kardex` |
| `es_opcional` | `TRUE` = no se descarga automáticamente (ingrediente electivo) |

---

## Flujo 9 — Descarga de Venta (Descarga por Receta)

**Descripción:** Cuando un pedido se completa, el sistema calcula automáticamente los ingredientes consumidos en base a las recetas y los descuenta del kardex del área de producción. Es equivalente a registrar una salida masiva por ventas del día.

**Tablas involucradas:** `descarga_venta`, `descarga_venta_detalle`, `recetas`, `receta_detalle`, `kardex_subalmacen`, `pivot_stock_por_area`, `pivot_auditoria`

### Precondiciones

> 1. El producto vendido debe tener una receta activa (`recetas.activo = TRUE`).  
> 2. El artículo debe tener `descarga_por_receta = TRUE` en `articulos`.  
> 3. El área de producción debe tener stock suficiente en `pivot_stock_por_area`.

### Pasos — Descarga automática al completar pedido

```
1. INICIO
   └─ Pedido pasa a estado COMPLETADO (orders.status = 'completed').

2. SISTEMA DETECTA ITEMS CON RECETA
   ├─ Para cada order_item: busca receta activa del producto
   └─ [Sin receta] → omite el item (no descarga)

3. CÁLCULO DE CONSUMO
   ├─ Por cada ingrediente de cada receta:
   │   cantidad_a_descargar = receta_detalle.cantidad
   │                          × order_item.quantity
   │                          ÷ recetas.porciones
   │                          ÷ (recetas.rendimiento_pct / 100)
   └─ Si es_costos = TRUE → convertir a unidad_kardex usando factor_equivalencia

4. CREAR DESCARGA DE VENTA
   ├─ Se crea registro en descarga_venta (estado: GENERADO)
   ├─ Se crean líneas en descarga_venta_detalle con cantidad + precio_promedio actual
   └─ total_costo = SUM(cantidad × precio_promedio)

5. PROCESAR DESCARGA
   ├─ Estado: GENERADO → PROCESADO
   ├─ Por cada ingrediente:
   │   ├─ kardex_subalmacen: registra SALIDA en el área de producción
   │   └─ pivot_stock_por_area: actualiza stock del área
   └─ pivot_auditoria: registra PROCESAR con descripción del pedido

6. ALERTA DE STOCK BAJO
   └─ Si stock_actual < stock_minimo → genera alerta para el almacenero

7. FIN — El inventario refleja el consumo real por ventas.
```

### Pasos — Descarga manual por lote (cierre de turno)

```
1. Almacenero accede a: Almacén → Descarga de Venta
2. Seleccionar rango de pedidos o turno a descargar
3. Sistema consolida consumo de todos los pedidos del período
4. Revisar cantidades calculadas vs stock disponible
5. PROCESAR → mismo flujo desde paso 5 anterior
```

### Fórmula de cálculo

```
cantidad_ingrediente = (cantidad_receta / porciones_receta)
                       × unidades_vendidas
                       × (1 / rendimiento_porcentual)

Ejemplo:
  Receta Lomo Saltado: 0.200 kg carne / porción, rendimiento 90%
  Vendidos: 5 unidades
  → 0.200 / 1 × 5 / 0.90 = 1.111 kg a descargar
```

### Diferencia con Salidas (Flujo 4)

| Concepto | Descarga de Venta (Flujo 9) | Salidas (Flujo 4) |
|----------|-----------------------------|--------------------|
| Origen | Pedidos completados + recetas | Manual (rotura, baja, consumo) |
| Cálculo | Automático por receta | Ingresado por el operador |
| Área afectada | Área de producción de la receta | Cualquier área |
| Frecuencia | Por pedido o por turno | Diaria / cuando ocurre |

---

## Flujo 10 — Control de Vencimientos y Lotes

**Descripción:** Registra cada ingreso de mercadería como un lote (batch) independiente con su fecha de vencimiento. Permite trazabilidad FIFO real, alertas de caducidad y control de artículos perecibles.

**Tablas involucradas:** `lotes`, `articulos`, `documentos`, `areas`, `kardex_central`

### Cuándo aplica

> El control de lotes aplica a todo artículo con `dias_vencimiento > 0` en `articulos`. Al ingresar un documento (Flujo 1), el sistema crea automáticamente un lote por cada línea de artículo perecible.

### Pasos — Creación de lote al ingresar documento

```
1. DOCUMENTO PROCESADO (Flujo 1, paso 8)
   └─ Sistema evalúa: articulos.dias_vencimiento > 0 ?

2. [SI perecible] → CREAR LOTE
   ├─ fecha_ingreso    = fecha_ingreso del documento
   ├─ fecha_vencimiento = fecha_ingreso + dias_vencimiento
   ├─ cantidad_inicial = cantidad del documento_detalle
   ├─ cantidad_actual  = igual a cantidad_inicial
   └─ numero_lote      = número de lote del proveedor (si está en el documento)

3. ESTADO INICIAL
   └─ lotes.estado = 'vigente'
```

### Pasos — Monitoreo diario de vencimientos

```
1. JOB DIARIO (o consulta manual)
   └─ Sistema evalúa todos los lotes activos:

2. CLASIFICACIÓN AUTOMÁTICA
   ├─ fecha_vencimiento < HOY               → estado = 'vencido'
   ├─ fecha_vencimiento ≤ HOY + alerta_dias → estado = 'proximo_vencer'
   └─ fecha_vencimiento > HOY + alerta_dias → estado = 'vigente'
   (alerta_dias viene de configuracion_sistema.stock_alerta_dias)

3. ALERTA AL ALMACENERO
   ├─ Lista de artículos en estado 'proximo_vencer' y 'vencido'
   ├─ Área donde se encuentran
   └─ Cantidad y valor en riesgo (cantidad × precio_promedio)

4. ACCIÓN DEL ALMACENERO
   ├─ [Próximo a vencer] → Priorizar uso en producción (FIFO)
   ├─ [Vencido] → Registrar Salida tipo "Bajas" (Flujo 4) + marcar lote agotado
   └─ Lote agotado: cantidad_actual = 0, estado = 'agotado'
```

### Consumo de lotes — FIFO

```
Al descargar stock (Descarga de Venta o Salida):
  1. Sistema toma primero los lotes más antiguos (fecha_ingreso ASC)
  2. Consume el lote hasta agotarlo, luego pasa al siguiente
  3. Actualiza lotes.cantidad_actual en cada paso
  4. Si lote.cantidad_actual llega a 0 → estado = 'agotado'
```

### Estados del lote

| Estado | Condición | Acción sugerida |
|--------|-----------|-----------------|
| `vigente` | Dentro de fecha de vencimiento y con stock | Uso normal |
| `proximo_vencer` | Vence en ≤ `stock_alerta_dias` días | Priorizar en producción |
| `vencido` | `fecha_vencimiento < HOY` | Registrar baja inmediata |
| `agotado` | `cantidad_actual = 0` | Ninguna (sin stock) |

### Vista disponible: `v_articulos_por_vencer`

Muestra todos los lotes en estado `proximo_vencer` o `vencido`, con área, días restantes y valor en riesgo.

---

## Reglas de Negocio Transversales

### FIFO (First In, First Out)

> El primer producto en ingresar es el primero en salir.  
> Aplicar siempre al almacenar y despachar.  
> Etiquetar productos con **fecha de ingreso** y **fecha de vencimiento**.

### Metodología de Precio Promedio Ponderado (PP)

```
PP_nuevo = (Stock_anterior × PP_anterior + Cantidad_nueva × Precio_nuevo)
           ──────────────────────────────────────────────────────────────
                        (Stock_anterior + Cantidad_nueva)
```

Se actualiza automáticamente con cada ingreso de documento procesado.

### Regla de Áreas y Artículos

```
Artículo creado → asignado automáticamente a Almacén Central
Artículo sin área en subalmacén → NO aparece en requerimientos de ese subalmacén
Para asignar: Maestro de Artículos → botón Áreas → agregar subalmacén
```

### Secuencia correcta de movimientos

```
1. Ingresar documentos (compras)
2. Crear y procesar requerimientos
3. Crear y procesar transferencias
4. Registrar salidas
5. Ejecutar porcionamientos
6. [Fin de período] Ejecutar ajuste de inventarios
```

> ⚠ **No iniciar un ajuste de inventario si existen movimientos en estado GENERADO.**

### Reglas de descuentos en documentos

- Descuento por artículo y descuento al total son **excluyentes entre sí**.
- El descuento al total puede aplicarse al precio neto o al total, en monto o porcentaje.

### Condiciones físicas del almacén

| Distancia | Medida mínima |
|-----------|:-------------:|
| Del piso | 15 cm |
| De la pared | 5 cm |
| Del techo | 45 cm |

- Usar **luces fluorescentes** (no incandescentes).
- Todos los anaqueles deben estar **etiquetados y zonificados**.
- Anaqueles siempre **anclados a la pared**.

---

## Tablas afectadas por flujo

| Flujo | Cabecera (ES) | Detalle (ES) | Tabla API | Kardex API |
|-------|---------------|--------------|-----------|------------|
| Ingreso documentos | `documentos` | `documento_detalle` | `purchase_documents` | `main_ledger` / `area_ledger` |
| Requerimientos | `requerimientos` | `requerimiento_detalle` | `requisitions` | central salida + sub ingreso |
| Transferencias | `transferencias` | `transferencia_detalle` | `stock_transfers` | `area_ledger` |
| Salidas | `salidas` | `salida_detalle` | `stock_exits` | `area_ledger` |
| Porcionamiento | `porcionamientos` | `porcionamiento_detalle` | `portionings` | `area_ledger` + `waste_log` |
| Ajuste inventarios | `ajuste_inventarios` | `ajuste_detalle` | `inventory_adjustments` | según área |
| Carga de recetas | `recetas` | `receta_detalle` | `recipes` | — |
| Descarga de venta | `descarga_venta` | `descarga_venta_detalle` | `sales_discharge` | `area_ledger` |
| Control vencimientos | `lotes` | — | `batches` | FIFO en salidas |

> **Auditoría:** la API escribe en `audit_log` (`pivot_auditoria`) en cada `PROCESS`, `VOID`, `ADJUST` e INSERT/UPDATE de maestros. Ver [Sistema de Auditoría](#sistema-de-auditoría).

---

## Tablas de Soporte del Sistema

Estas tablas no generan movimientos de inventario pero son necesarias para la trazabilidad y la parametrización del sistema.

### `usuarios`

Catálogo de operadores que registran movimientos en el sistema.

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id_usuario` | SERIAL PK | Identificador único |
| `nombre` | VARCHAR(100) | Nombre completo del operador |
| `email` | VARCHAR(150) UNIQUE | Correo de acceso |
| `rol` | VARCHAR(50) | `admin` · `almacenero` · `supervisor` · `contador` |
| `activo` | BOOLEAN | Estado del operador |

> **Relación con tablas de movimiento:** los campos `usuario VARCHAR(100)` en `documentos`, `requerimientos`, `transferencias`, `salidas`, `porcionamientos` y `ajuste_inventarios` deben contener el `nombre` de un registro de esta tabla. La columna `id_usuario` en `pivot_auditoria` es la FK tipada para consultas auditables.

### `configuracion_sistema`

Parámetros operativos editables en caliente sin necesidad de despliegue de código.

| Clave (PK) | Valor por defecto | Descripción |
|------------|:-----------------:|-------------|
| `igv_porcentaje` | `18` | Tasa de IGV (%) en compras gravadas |
| `moneda_defecto` | `Nuevos Soles` | Moneda base del sistema |
| `metodo_costeo` | `PP` | Método de costeo: PP = Precio Promedio Ponderado |
| `periodo_activo` | *(vacío)* | Período contable activo `AAAA-MM`; vacío = sin restricción |
| `stock_alerta_dias` | `3` | Días de anticipación para alertas de stock bajo mínimo |

> Todo cambio en `configuracion_sistema` debe generar un registro en `pivot_auditoria` con `tabla = 'configuracion_sistema'` y `operacion = 'UPDATE'`.

---

## Sistema de Auditoría

### Tabla `pivot_auditoria` → `audit_log`

Registro centralizado de todas las operaciones que alteran datos críticos. Se escribe desde la **capa de aplicación (API)** (`writeAuditLog` en `services/warehouse/shared/audit.service.ts`).

| Columna (ES) | Columna API | Descripción |
|--------------|-------------|-------------|
| `id` | `id` | BIGSERIAL PK |
| `tabla` | `table_name` | Tabla afectada (`purchase_documents`, `items`, …) |
| `operacion` | `operation` | `INSERT` · `UPDATE` · `DELETE` · `PROCESS` · `VOID` · `ADJUST` |
| `id_registro` | `record_id` | PK del registro |
| `datos_anterior` | `before_data` | JSONB snapshot previo |
| `datos_nuevo` | `after_data` | JSONB snapshot nuevo |
| `id_usuario` | `user_id` | FK → `users` |
| `usuario_nombre` | `user_name` | Desnormalizado |
| `modulo` | `module` | Módulo de negocio |
| `descripcion` | `description` | Texto legible |
| `ip_address` | `ip_address` | IP del cliente |
| `fecha` | `created_at` | TIMESTAMPTZ |

### Tipos de operación (`operacion`)

| Valor | Cuándo usarlo |
|-------|--------------|
| `INSERT` | Creación de un nuevo registro (cabecera en estado GENERADO) |
| `UPDATE` | Modificación de campos en estado GENERADO (antes de procesar) |
| `DELETE` | Eliminación física de un registro |
| `PROCESAR` | Transición GENERADO → PROCESADO (impacta kardex y stock) |
| `ANULAR` | Transición a ANULADO (revierte stock) |
| `AJUSTAR` | Cierre de inventario aplica diferencias físicas vs sistema |

### Eventos que generan registro de auditoría por flujo

| Flujo | Tabla afectada | Operación registrada | Descripción recomendada |
|-------|---------------|---------------------|------------------------|
| Ingreso documentos | `documentos` | `PROCESAR` | `"Procesó {tipo} {serie}-{correlativo} — {proveedor}"` |
| Ingreso documentos | `documentos` | `ANULAR` | `"Anuló {tipo} {serie}-{correlativo}"` |
| Requerimientos | `requerimientos` | `PROCESAR` | `"Procesó RQ-{id} — Área: {area}"` |
| Transferencias | `transferencias` | `PROCESAR` | `"Procesó TR-{id} — {origen} → {destino}"` |
| Salidas | `salidas` | `PROCESAR` | `"Procesó salida {tipo} — Área: {area}"` |
| Porcionamiento | `porcionamientos` | `PROCESAR` | `"Porcionó {articulo} {cantidad}{unidad} — Merma: {pct}%"` |
| Ajuste inventarios | `ajuste_inventarios` | `AJUSTAR` | `"Cerró ajuste {codigo} — Área: {area}"` |
| Maestro artículos | `articulos` | `UPDATE` | `"Modificó precio/stock de {descripcion}"` |
| Configuración | `configuracion_sistema` | `UPDATE` | `"Cambió {clave}: {valor_ant} → {valor_nuevo}"` |

### Consultas útiles

```sql
-- Historial de un documento específico
SELECT fecha, operacion, usuario_nombre, descripcion
FROM pivot_auditoria
WHERE tabla = 'documentos' AND id_registro = :id_documento
ORDER BY fecha;

-- Actividad de un operador en el último mes
SELECT fecha, modulo, tabla, operacion, descripcion
FROM pivot_auditoria
WHERE id_usuario = :id_usuario
  AND fecha >= NOW() - INTERVAL '30 days'
ORDER BY fecha DESC;

-- Todos los ajustes de inventario del período
SELECT fecha, descripcion, usuario_nombre, datos_anterior, datos_nuevo
FROM pivot_auditoria
WHERE operacion = 'AJUSTAR'
  AND fecha BETWEEN :fecha_inicio AND :fecha_fin
ORDER BY fecha DESC;

-- Cambios recientes en artículos maestros
SELECT fecha, usuario_nombre, descripcion,
       datos_anterior->>'precio_promedio' AS pp_antes,
       datos_nuevo->>'precio_promedio'    AS pp_despues
FROM pivot_auditoria
WHERE tabla = 'articulos' AND operacion = 'UPDATE'
ORDER BY fecha DESC
LIMIT 50;
```

### Vista disponible

`v_auditoria_reciente` — auditoría completa ordenada por fecha DESC, enriquecida con el rol del usuario. Incluye los campos `datos_anterior` y `datos_nuevo` para comparación antes/después.

---

---

## Comparativa con Sistemas a Mayor Escala

Esta sección compara el diseño actual con GastroPro 360 y con sistemas enterprise de gestión de restaurantes (MarketMan, Toast, Lightspeed), identificando lo que ya está cubierto y los gaps a resolver.

### Tabla comparativa general

| Funcionalidad | Este sistema | GastroPro 360 | Enterprise (MarketMan / Toast) |
|---------------|:------------:|:-------------:|:------------------------------:|
| Kardex central + subalmacenes | ✅ | ✅ | ✅ |
| Precio Promedio Ponderado | ✅ | ✅ | ✅ |
| Requerimientos (central → sub) | ✅ | ✅ | ✅ |
| Transferencias entre áreas | ✅ | ✅ | ✅ |
| Salidas / bajas operativas | ✅ | ✅ | ✅ |
| Porcionamiento con merma | ✅ | ✅ | ✅ |
| Ajuste de inventario | ✅ | ✅ | ✅ |
| **Recetas (menú → ingredientes)** | ✅ Flujo 8 | ⚠️ flag sin tablas | ✅ Full recipe mgmt |
| **Descarga de venta automática** | ✅ Flujo 9 | ⚠️ manual/batch | ✅ Auto en orden |
| **Lotes y vencimientos** | ✅ Flujo 10 | ⚠️ días_vencimiento solo | ✅ Batch + SUGG |
| Sub-recetas (receta como ingrediente) | ⬜ Pendiente | ❌ | ✅ |
| Variantes de receta por modificador | ⬜ Pendiente | ❌ | ✅ |
| Costo teórico vs consumo real | ⬜ Pendiente | ⚠️ ajuste vs descarga | ✅ Full variance |
| Alérgenos por ingrediente | ⬜ Pendiente | ❌ | ✅ |
| Orden de compra automática | ❌ | ❌ | ✅ |
| Integración con proveedores EDI | ❌ | ❌ | ✅ |
| Auditoría centralizada | ✅ `pivot_auditoria` | ❌ | ✅ |
| Multi-tenant (múltiples locales) | ✅ arquitectura | ❌ mono-tenant | ✅ |

### Diferencias clave con GastroPro 360

**1. Recetas explícitas vs flag implícito**

GastroPro 360 usa `articulos.descarga_por_receta = TRUE` como flag, pero no tiene tablas `recetas` ni `receta_detalle`. La descarga se hace de forma manual o por configuración externa. Este sistema, al agregar `recetas` + `receta_detalle`, cierra ese gap y permite costeo automático.

**2. Lotes vs días de vencimiento**

GastroPro 360 almacena `dias_vencimiento` en el maestro de artículos — es un parámetro fijo que no rastrea lotes individuales. Este sistema agrega la tabla `lotes` para trazar cada ingreso por separado, habilitando FIFO real y alertas por lote específico.

**3. Descarga de venta integrada con pedidos**

GastroPro 360 requiere ejecutar la descarga manualmente desde el módulo contable. Este sistema la integra directamente con el flujo de pedidos (`orders.status = 'completed'`), permitiendo descarga en tiempo real o por cierre de turno.

**4. Multi-tenant desde el diseño**

GastroPro 360 es mono-tenant (una BD por instalación). Este sistema nació multi-tenant: cada restaurante tiene su propia base de datos con el esquema completo de almacenes.

### Gaps pendientes (próximas iteraciones)

| Gap | Descripción | Prioridad |
|-----|-------------|:---------:|
| Sub-recetas | Una receta puede ser ingrediente de otra (ej: masa base, salsas). Requiere `receta_detalle.id_receta_insumo` para referenciar otra receta | Alta |
| Variantes de receta | `products.alternatives` (cremas, términos) deben tener su propia línea en `receta_detalle` con `es_opcional = TRUE` o sub-receta propia | Alta |
| Costo teórico vs real | Vista `v_varianza_food_cost`: comparar `descarga_venta_detalle` (teórico) vs `salidas + ajuste_detalle` (real) por período | Media |
| Alérgenos | Columna `alergenos JSONB` en `articulos` + vista `v_receta_alergenos` | Baja |
| Alertas push | Job periódico que evalúa `v_stock_alerta` y `v_articulos_por_vencer` y envía notificaciones | Media |

### Flujo completo integrado (ventas ↔ almacén)

```
CLIENTE hace pedido
  └─ orders → order_items creados

COCINA confirma y prepara
  └─ orders.status = 'preparing'

PEDIDO COMPLETADO
  └─ orders.status = 'completed'
      └─ Sistema busca receta por cada product_id
          └─ Calcula consumo de ingredientes
              └─ Crea descarga_venta (GENERADO)
                  └─ PROCESAR descarga
                      ├─ kardex_subalmacen: SALIDA por cada ingrediente
                      ├─ pivot_stock_por_area: actualiza stock
                      ├─ lotes: decrementa cantidad_actual (FIFO)
                      ├─ pivot_auditoria: registra PROCESAR
                      └─ [stock < minimo] → genera ALERTA
```

---

*Documento generado por ingeniería inversa del Manual de Almacenes e Inventarios GastroPro 360 — Estrategia Gastronómica A & G S.A.C.*
