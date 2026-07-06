# US 1.5 — Operadores y Propiedades: guía de diseño (sin código)

> **Estado:** propuesta para revisión. No se ha modificado ningún schema ni pantalla todavía.
> **Alcance de esta iteración:** solo el flujo de modificadores de producto (US 1.5), usando la lógica de catálogo por **sucursal** tal como funciona hoy. Corporación/Marca quedan fuera de este análisis.

## La pregunta de fondo

¿El mismo mecanismo de "extras" (con precio y descuento de stock) sirve para modelar algo como
**Temperatura**, que normalmente no cobra ni descuenta nada?

**Ejemplo de negocio:** Producto *Gaseosa Inca Kola* → Operador *Temperatura* → Propiedades
*Sin Helar / Helada / Al tiempo / Caliente*.

## Veredicto

**Sí — es el mismo mecanismo.** `productExtraGroups` (Operador) + `productExtras` (Propiedad),
ya definidos en `src/db/tenant/schema/extras.ts`, soportan esto casi perfecto:

- `isMultiple` + `isRequired` + `maxSelections` ya permiten forzar "elige exactamente una"
  (Temperatura) en el mismo sistema que permite "elige varias, cada una con precio"
  (Extras de cocina, ej. queso extra).
- Lo único que falta es un **tercer valor para `sourceType`**: hoy solo acepta `'item'` o
  `'recipe'`, obligando a inventar un item/receta falso para algo que no descuenta stock.
  Con `'none'`, "Helada" es simplemente una etiqueta de preparación sin costo ni movimiento
  de almacén.

## Por qué no crear una tabla aparte de "Opciones/Variantes"

La alternativa obvia sería separar "Extras con costo" de "Opciones de preparación" en dos
sistemas distintos.

| Un solo modelo (Operador/Propiedad) | Dos sistemas separados |
|---|---|
| El cajero configura el menú en un solo lugar, con una sola lógica que aprender | Duplica CRUD, duplica pantallas de configuración de menú |
| Un mismo grupo puede evolucionar (ej. Temperatura hoy gratis, mañana cobra por hielo extra) sin migrar nada | El pedido necesitaría dos pivotes distintos hacia `order_items` |
| El ticket de cocina/bar ya sabe imprimir "extras" — Temperatura sale gratis por el mismo canal | Un producto con "opción de preparación + extra con costo" (ej. sushi: temperatura del arroz + extra de palta) quedaría partido en dos flujos |

## El flujo, pantalla por pantalla

Caso: *Gaseosa Inca Kola × 3 Helada*, luego *Gaseosa Inca Kola × 3 Fría* — dos líneas de
pedido distintas, mismo producto.

### Pantalla 1 — Carta
El mozo toca **Inca Kola 500ml** en la grilla de productos de la sucursal. Se abre la hoja
de configuración del producto.

### Pantalla 2a — Primera línea
```
┌─────────────────────────────┐
│ 🥤 Inca Kola 500ml  S/ 6.00  │
│                              │
│ Cantidad        [-] 3 [+]   │
│                              │
│ TEMPERATURA        elige 1  │
│ ( Sin Helar ) (●Helada) ... │
│ ( Al tiempo ) ( Caliente )  │
│                              │
│   [ Agregar 3 — S/ 18.00 ]  │
└─────────────────────────────┘
```
Grupo **obligatorio, selección única** — el botón de confirmar no se activa sin elegir.
El precio no cambia porque `productExtras.price = 0` para estas propiedades.

### Pantalla 2b — Segunda línea
El mozo **vuelve a tocar el mismo producto** y elige otra propiedad (Fría). No existe forma
de mezclar dos temperaturas en una sola línea — **eso es intencional**: cada combinación de
modificadores es una línea de pedido distinta.

### Pantalla 3 — Carrito / Pedido
```
Pedido — Mesa 7
──────────────────────────────
3×  Inca Kola 500ml            18.00
    Helada
──────────────────────────────
3×  Inca Kola 500ml            18.00
    Fría
──────────────────────────────
Total                          36.00
```
Cada línea es **editable y anulable por separado** — clave para US 3.2 (anulación de
producto individual con motivo obligatorio, registrado en logs de auditoría).

## El único campo nuevo

Todo lo demás en `extras.ts` queda igual. Sin tocar sucursal, marca ni corporación por ahora.

| Campo | Cambio |
|---|---|
| `productExtras.sourceType` | enum pasa de `['item', 'recipe']` a `['item', 'recipe', 'none']`. `'none'` = propiedad de preparación, sin costo ni descuento de almacén. |
| `itemId` / `recipeId` | ya son nullable hoy — con `sourceType: 'none'` ambos quedan en `null`, sin cambios de columna. |

## Antes de codear, confirmar

1. **¿El precio "S/ 18.00 c/u × 3" en pantalla es como se espera**, o el POS de mozo no debe
   mostrar precios (solo cocina/caja los ven)?
2. **¿Las notas libres** (ej. "sin hielo, con rodaja de limón") van aparte del selector de
   Temperatura, o el negocio prefiere que todo pase por Operadores/Propiedades predefinidos,
   sin texto libre?
3. Con luz verde, se implementa: la migración del enum `sourceType`, y la hoja de
   configuración de producto + carrito en el POS de mozo (US 3.1/3.2), reusando
   `productExtraGroups`/`productExtras` tal cual existen.

---
*Versión interactiva con mockups visuales: ver artifact compartido en la conversación.*
