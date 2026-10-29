# Caja — Cierre de turno

## POST `/api/cash/sessions/:id/close`

Cuerpo: `{ closingBalance: number, notes?: string, password?: string }`.

- Si el turno **no** tiene pedidos abiertos, cierra como siempre (`password` no hace falta).
- Si tiene pedidos abiertos (creados en el turno o transferidos a él, que no estén cancelados y estén sin terminar o sin cobrar), exige `password` de un usuario con el permiso **`seguridad.autorizar_cierre_turno`** (los `rol_admin` siempre pueden autorizar).
  - Sin contraseña o con contraseña inválida responde **409**:
    `{ success: false, message, requiresAuthorization: true, openOrders: [{ id, trackingCode }] }`.
  - Con contraseña válida, cierra el turno; los pedidos siguen abiertos y los cobra el turno siguiente (el ingreso va al turno de quien cobra, `collectedSessionId`).
- `closedBy` guarda el nombre del usuario que cierra. La auditoría (`audit_log`, módulo `caja`) registra quién autorizó y qué pedidos quedaron abiertos.

## Ubicación del dispositivo (apertura y cierre)

`POST /api/cash/sessions/open` y `POST /api/cash/sessions/:id/close` aceptan `geo` opcional:
`{ status: 'ok' | 'denied' | 'unavailable' | 'timeout', lat?, lng?, accuracy? }`. No bloquea nunca:
se guarda en `audit_log` (`latitude`, `longitude`, `geo_accuracy`, `geo_status`, `distance_to_branch`,
migración `0094`) junto con la IP. La distancia se calcula contra `branches.address.lat/lng`.
`geo` es **obligatorio** en apertura y cierre: debe traer `status: 'ok'` con `lat`/`lng` reales
del dispositivo (GPS o WiFi; un VPN no la altera porque no depende de la IP). Sin ubicación válida,
ambos endpoints responden **422** `{ success:false, requiresLocation:true, message }` y no abren/cierran.
El login (`POST /api/admin/login`) acepta el mismo `geo` y solo lo registra en Auditoría (no bloquea).
En Auditoría, las rutas con `/orders/:id` muestran el número de pedido (`#trackingCode`) en lugar del id interno.
