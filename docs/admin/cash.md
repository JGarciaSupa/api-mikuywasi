# Caja — Cierre de turno

## POST `/api/cash/sessions/:id/close`

Cuerpo: `{ closingBalance: number, notes?: string, password?: string, authCode?: string, geo? }`.

- Si el turno **no** tiene pedidos abiertos, cierra como siempre (`password` no hace falta).
- Si tiene pedidos abiertos (pedidos de la sucursal que no estén cancelados y estén sin terminar o sin cobrar), exige una autorización:
  - `authCode`: código de 6 dígitos de la autorización remota (ver abajo). De un solo uso.
  - `password`: contraseña de un usuario con el permiso **`seguridad.autorizar_cierre_turno`** (los `rol_admin` siempre pueden autorizar).
  - Si llegan ambos (el admin manda los dos cuando el texto son 6 dígitos), se prueba primero el código y luego la contraseña.
  - Sin autorización o inválida responde **409**:
    `{ success: false, message, requiresAuthorization: true, openOrders: [{ id, trackingCode }] }`.
  - Autorizado, cierra el turno; los pedidos siguen abiertos y los cobra el turno siguiente (el ingreso va al turno de quien cobra, `collectedSessionId`).
- `closedBy` guarda el nombre del usuario que cierra. La auditoría (`audit_log`, módulo `caja`) registra quién autorizó y qué pedidos quedaron abiertos.

## Turno de caja y sucursal: el turno manda, no el cajero

Cada venta, cobro, devolución y comprobante va al **turno de la caja donde se opera**. El turno se resuelve así
(`getActiveSessionForUserInBranch`):
1. el turno elegido en el equipo (cabecera **`X-Cash-Session`**, "Vendiendo en: Caja 2 · Turno 27"),
2. el turno de la caja vinculada al equipo (cabecera `X-Cash-Terminal`),
3. el único turno del usuario en esa sucursal.

Solo cuentan los turnos **abiertos de esa sucursal en los que el usuario participa**; un turno indicado que no cumpla se ignora.
Si el usuario está en varios turnos de la sucursal y el equipo no indica ninguno, la API responde
"Estás en varios turnos de esta sucursal (…). Elige en qué caja estás vendiendo." (**409** al crear pedido).
Un turno del usuario en **otra** sucursal no se usa ni bloquea: crear pedido cae al turno elegido o al turno abierto de la
sucursal (como el mozo), y cobrar exige un turno propio en esa sucursal.

## Varios turnos por cajero (`caja.turnos_multiples`)

Un usuario está como máximo en **un turno por caja**. Con el permiso `caja.turnos_multiples` ("Abrir turnos en varias cajas";
por defecto en `rol_admin_local` y `rol_cajero`) puede estar a la vez en turnos de varias cajas (n cajas, un cajero). Sin él,
un solo turno abierto. Se propaga a los tenants solo al arrancar la API (`docker/start.sh` ejecuta `rbac:add-missing --apply`; se desactiva con `RUN_RBAC_SYNC_ON_START=false`).

- `GET /api/cash/sessions/mine/open`: turnos abiertos del usuario con `registerName` y `series` de la caja (selector del POS).
- `GET /api/cash/sessions/mine`: el turno que indica el equipo (o el más reciente).

## Propinas por turno

La propina se guarda en cada cobro (`cash_movements.tip_amount`) y ya está incluida en el monto del ingreso
(si el cobro es en efectivo, también en `expectedBalance`). Para mostrarla aparte:
- `GET /cash/sessions/:id` incluye `totalTips` y `cashTips` (string decimal): propinas del turno y la parte en efectivo.
  Los cobros revertidos (egreso `reference = 'reverso'` del mismo pedido/cuenta en el turno) no cuentan. Se ocultan sin `caja.ver_contabilidad`.
- `GET /cash/reports/summary` incluye `kpis.totalTips` y `kpis.cashTips`; `GET /cash/reports/sessions` incluye `totalTips` por turno.
- Limitación conocida: el **pago mixto** (`recordOrderMultiPaymentIncome`) no guarda la propina en el movimiento de caja,
  por lo que esas propinas no aparecen aquí ni suman en caja (pendiente de decisión).

## Turno compartido por caja (por sucursal, apagado por defecto)

Interruptor `branches.shared_cash_session` (migración `0097`), editable con `PATCH /api/branches/:id` `{ sharedCashSession: boolean }`.

- **Apagado (por defecto):** como siempre; cada usuario abre su propio turno y una caja puede tener varios turnos abiertos.
- **Encendido:** `POST /cash/sessions/open` sobre una caja que ya tiene un turno abierto **no crea otro**: el usuario se une a ese
  turno (tabla `cash_session_participants`) y responde **200** `{ success, message: "Continúas el turno compartido …", data: { …turno, joined: true } }`.
  Se ignoran `openingBalance`, tipo de cambio y notas. Si la caja no tiene turno abierto, se abre uno nuevo (**201**) como siempre.
  Sigue aplicando el control de equipos y la regla "un usuario, un turno abierto".
- El turno abierto de un participante (`GET /cash/sessions/mine` y todos los cobros, pedidos, devoluciones y comprobantes que usan
  `getActiveSessionForUser`) es el turno compartido: todo entra a la misma liquidación.
- Cualquier usuario con `caja.cerrar_sesion` puede cerrarlo (igual que hoy, el cierre no exige ser el cajero que abrió).
- `GET /cash/registers` (`openSessions[]`), `GET /cash/sessions` y `GET /cash/sessions/:id` incluyen `participants: [{ userId, name, joinedAt }]`;
  un participante puede ver el detalle y los montos de su turno compartido. `GET /cash/reports/sessions` incluye `participantNames`.
- Auditoría: "(usuario) continúa el turno compartido (código) de (caja)".

## Control de equipos de caja (por sucursal, apagado por defecto)

Dos interruptores en `branches` (migración `0096`), editables con `PATCH /api/branches/:id`:

| Campo | Efecto en `POST /cash/sessions/open` y `POST /cash/sessions/:id/close` |
|---|---|
| `requireCashTerminal` | Exige la cabecera `X-Cash-Terminal` con el token de un equipo vigente vinculado a **esa caja**. Si no: **403** `{ success:false, requiresTerminal:true, message }`. |
| `requireCashLocation` | Exige `geo` con `status: 'ok'`, `lat`/`lng` y precisión ≤ 5 km. Si no: **422** `{ success:false, requiresLocation:true, message }`. |

- Quien tiene **`caja.gestionar_cajas`** (y `rol_admin`) opera desde cualquier equipo y sin ubicación.
- Con ambos apagados no se exige nada (antes el cierre exigía siempre la ubicación). Si llega `geo`, se guarda en `audit_log`
  (`latitude`, `longitude`, `geo_accuracy`, `geo_status`, `distance_to_branch`, migración `0094`) junto con la IP;
  la distancia se calcula contra `branches.address.lat/lng`.
- El login (`POST /api/admin/login`) acepta el mismo `geo` y solo lo registra en Auditoría (no bloquea).

## Vinculación de equipos — `/api/cash-terminals`

Los secretos (token del equipo, PIN, token de enlace) solo se guardan como hash SHA-256 y se muestran una única vez.

| Método y ruta | Permiso | Request | Response |
|---|---|---|---|
| `POST /pairing-codes` | `caja.gestionar_cajas` | `{ registerId }` | **201** `{ code (6 dígitos), token, expiresAt, registerId, registerName, branchId, branchName }` — vence en 15 min, un solo uso |
| `POST /pair` | sesión + `caja.abrir_sesion` o `caja.gestionar_cajas` | `{ code? , token?, deviceName? }` | **201** `{ terminalToken, terminal: { id, name, registerId, registerName, branchId, branchName, pairedAt } }`; código inválido/usado/vencido **410** |
| `GET /current` | sesión | cabecera `X-Cash-Terminal` | `data`: el equipo vigente o `null` |
| `GET /?branchId=` | `caja.gestionar_cajas` | — | equipos vigentes con `lastSeenAt` y `pairedByName` |
| `DELETE /:id` | `caja.gestionar_cajas` | — | revoca el equipo (su token deja de servir) |

`/pair` está limitado a 15 intentos cada 15 minutos por IP.

## Autorización remota de cierre — `/api/cash-terminals/close-requests`

1. El cajero pide la autorización: `POST /close-requests` `{ sessionId }` (sesión + `caja.cerrar_sesion`) → **201** `{ id, requestToken, expiresAt }` (30 min).
   El admin envía por WhatsApp el enlace `/autorizar-cierre?r=<requestToken>`.
2. El supervisor abre el enlace en su celular, **sin sesión** (solo `X-Tenant-Slug`):
   - `GET /close-requests/:token` → resumen `{ status, expiresAt, sessionCode, sessionOpen, cashierName, registerName, branchName, openOrdersCount, openOrdersTotal }`.
   - `POST /close-requests/:token/approve` `{ password }` → valida la contraseña (mismo criterio que el cierre) y devuelve **200** `{ code (6 dígitos), expiresAt, approvedByName }`.
     Contraseña incorrecta **403** (indica intentos restantes); a los 5 fallos la solicitud queda bloqueada (**423**); ya aprobada **409**; vencida **410**.
     Limitado a 15 intentos cada 15 minutos por IP.
3. El cajero cierra con `authCode` en `POST /cash/sessions/:id/close`. El código sirve una sola vez y para ese turno; 5 códigos erróneos bloquean la solicitud.

La contraseña del supervisor nunca viaja al cajero ni por WhatsApp.

En Auditoría, las rutas con `/orders/:id` muestran el número de pedido (`#trackingCode`) en lugar del id interno.

## Liquidación de cajero — GET `/api/cash/sessions/:id/liquidation?user=`

Solo lectura. Exige `caja.ver_contabilidad` y, como el detalle del turno, `caja.ver_todos_turnos` o ser el cajero/participante del turno. Sirve con el turno abierto (parcial, `isFinal: false`) o cerrado (definitiva). El admin la imprime como PDF A4 ("Liquidación" en el cierre de turno y en Reportes → Turnos).

- `documents`: comprobantes del turno. Uno pertenece al turno si su pedido o cuenta dividida **se cobró** en él; si está pendiente de pago, si el pedido **se generó** en él. Las notas de crédito van al turno en que se emitieron (serie de la caja del turno y hora dentro del turno).
- `payments.cash` / `payments.other`: cobros agrupados por medio de pago (`isCash` congelado en el movimiento) con documento, hora, venta, **cobrado (propina incluida)**, propina, retención, N.º de operación y usuario.
- `expenses` (gastos, retiros y devoluciones), `incomes` (ingresos y depósitos manuales), `discounts`, `otherShiftOrders` (pedidos generados en otro turno y cobrados en este), `correlatives` (del/al, emitidos y anulados por serie).
- `summary`: cobrado (efectivo / otros), de ello ventas y propinas, retención, documentos (valor venta, impuestos, total, n.º, promedio), notas de crédito, por cobrar, descuentos, egresos y el arqueo del turno (fondo, esperado, declarado, diferencia).
- `user` (opcional) filtra por el usuario que registró cada operación; `users` lista los disponibles. El arqueo siempre es del turno completo.

Usuario de cada cobro: quien registró el pago (`order_payments.created_by_id`), porque `cash_movements.created_by` suele quedar como `sistema`.

## Liquidación por cajero — GET `/api/cash/liquidation/cashier?userId=&branchId=&from=&to=`

Todo lo que cobró un cajero en los turnos de la sucursal con actividad en el rango (máx. 31 días), sea cual sea la caja:
`turnos[]` (cada uno con su serie, documentos, cobros por medio de pago y resumen), `byMethod` y `totals`
(cobrado, de ello ventas y propinas, retención, documentos). Exige `caja.ver_contabilidad`; ver a otro cajero exige
`caja.ver_todos_turnos`. El arqueo de efectivo se cuadra por turno (su caja), no por cajero.
