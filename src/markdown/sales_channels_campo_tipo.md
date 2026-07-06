# Canales de Venta — ¿Qué es el campo "Tipo"?

> **Estado:** decisión tomada (se mantiene), documentada para no volver a preguntarse esto más adelante.

## La duda que surgió

Al usar el formulario de "Nuevo/Editar Canal de Venta" (`/dashboard/sales-channels`), no era obvio
qué es el campo **Tipo** (`dine_in` / `delivery` / `pickup`), de dónde sale, ni si hay que "registrar
tipos" en algún lado. El texto de ayuda dice *"Agrupa el canal para reportes"*, pero no hay ningún
reporte construido todavía que lo use.

## Qué es exactamente

**No es un catálogo editable.** `Tipo` es un enum fijo en el código (backend: Zod
`z.enum(['dine_in', 'delivery', 'pickup'])`, tabla `sales_channels.type` como `varchar` validado a
nivel de aplicación). No existe pantalla para "agregar más tipos" — son solo esas 3 opciones para
siempre, a menos que alguien edite el código.

## Para qué sirve HOY (ya construido, no especulativo)

1. **Ícono y color** en el tab "Canales de Venta" de la sucursal (`BranchDetailPage.tsx`,
   `CHANNEL_TYPE_STYLE`) — 🍽️ naranja para `dine_in`, 🚚 azul para `delivery`, 📦 verde para `pickup`.
2. **Visibilidad del bloque "Configuración de Delivery"** (pedido mínimo, costo de envío, envío
   gratis desde, rastreo GPS) — solo aparece si la sucursal tiene activo al menos un canal con
   `type === 'delivery'`.

## Para qué se pensó pero NO existe todavía (especulativo)

Agrupar canales para reportes corporativos (Epic 6 del backlog SIGG: Reporte de Registro de Ventas,
Ranking de Producción, etc.) — por ejemplo, sumar "Rappi" + "PedidosYa" bajo un solo grupo
"Delivery" en un reporte. **Ningún reporte existe aún que lea este campo con ese fin.**

## Decisión

**Se mantiene el campo.** Quitarlo rompería las dos funcionalidades reales ya construidas (ícono/estilo
y visibilidad del bloque de Delivery) — no es solo la parte especulativa de reportes. El costo de
mantenerlo es una sola decisión al crear el canal (una vez), no una pantalla ni un CRUD adicional.

**Si en el futuro se revisa esta decisión:** confirmar primero qué reportes de Epic 6 se van a
construir realmente y si necesitan una clasificación distinta a estos 3 tipos, antes de tocar este
campo.
