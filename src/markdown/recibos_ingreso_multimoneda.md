# Recibos de Ingreso (Operaciones)

> Multi-moneda: **descartado por ahora**. Sin cambios de schema, sin selector de moneda.
> Todo el movimiento se registra en la moneda base de la sucursal, igual que hoy funciona
> el resto del sistema de caja.

## 1. Objetivo

Nueva sección **"Recibos de Ingreso"** bajo **Operaciones**, para registrar un ingreso de dinero a la caja del cajero sin tener que pasar por Configuración de Cajas:

- Resuelve automáticamente la caja/turno del cajero autenticado (no se elige manualmente).
- Registra el movimiento con concepto, monto y método de pago.
- Muestra un recibo interno imprimible al terminar (no es un comprobante SUNAT, es un recibo interno de caja).
- A futuro (fuera de este alcance): podrá vincularse a un pedido/reserva — el campo `orderId` ya existe en `cash_movements`, no requiere cambios adicionales para habilitarlo después.

Esto reutiliza 100% el sistema de movimientos de caja (`cash_movements` / `addCashMovement` / `POST /cash/sessions/:id/movements`) que ya existe — **no hay cambios de backend**, es puramente una pantalla nueva en el frontend.

## 2. Backend — nada que tocar

Ya existe todo lo necesario:
- `GET /cash/sessions/mine` (`cajaApi.getMySession`) — resuelve el turno abierto del usuario autenticado.
- `POST /cash/sessions/:id/movements` (`cajaApi.addMovement`) — registra el movimiento (`movementType: 'income'`, `concept`, `amount`, `paymentMethod`, `reference`).
- Permiso `caja.registrar_movimiento` — ya existe y ya protege esta misma acción en la pantalla de Caja actual.

## 3. Frontend

### Nueva página `pages/dashboard/tenants/income-receipts/page.tsx`
- Ruta `/dashboard/income-receipts`, entrada nueva en el sidebar dentro de **Operaciones** (junto a "Pedidos" y "Documentos"), gateada por `caja.registrar_movimiento`.
- Al entrar: `cajaApi.getMySession()` para resolver el turno abierto del cajero.
  - Sin turno abierto → bloquea con mensaje claro ("Debes tener un turno de caja abierto para registrar un recibo de ingreso").
  - Con turno → muestra la caja/turno como contexto de solo lectura (nombre de caja, código de turno).
- Formulario: Monto, Concepto (ej. "Adelanto de reserva", "Depósito"), Método de pago (mismo catálogo que ya usa Caja vía `paymentMethodsApi`), Referencia (opcional).
- Al guardar → `addMovement(tenantId, session.id, { movementType: 'income', concept, amount, paymentMethod, reference })`.
- Recibo en pantalla tras guardar: monto, concepto, método de pago, caja, cajero, fecha/hora, correlativo del turno — con botón "Imprimir" (`window.print()`).
- Lista corta de "Recibos registrados en este turno" (filtra `movementType === 'income'` de los movimientos ya cargados de la sesión) para contexto.

## 4. Checklist

- [ ] `pages/dashboard/tenants/income-receipts/page.tsx` — página nueva.
- [ ] Ruta en el router del frontend.
- [ ] Entrada en el sidebar (`Operaciones`).
- [ ] Typecheck frontend.

¿Continúo con esto?
