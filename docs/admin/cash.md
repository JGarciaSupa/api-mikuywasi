# Caja — Cierre de turno

## POST `/api/cash/sessions/:id/close`

Cuerpo: `{ closingBalance: number, notes?: string, password?: string }`.

- Si el turno **no** tiene pedidos abiertos, cierra como siempre (`password` no hace falta).
- Si tiene pedidos abiertos (creados en el turno o transferidos a él, que no estén cancelados y estén sin terminar o sin cobrar), exige `password` de un usuario con el permiso **`seguridad.autorizar_cierre_turno`** (los `rol_admin` siempre pueden autorizar).
  - Sin contraseña o con contraseña inválida responde **409**:
    `{ success: false, message, requiresAuthorization: true, openOrders: [{ id, trackingCode }] }`.
  - Con contraseña válida, cierra el turno; los pedidos siguen abiertos y los cobra el turno siguiente (el ingreso va al turno de quien cobra, `collectedSessionId`).
- `closedBy` guarda el nombre del usuario que cierra. La auditoría (`audit_log`, módulo `caja`) registra quién autorizó y qué pedidos quedaron abiertos.
