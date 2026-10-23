# Extras — Vínculo masivo de grupos por categoría

Base: `/api/products` · Cabecera `X-Tenant-Slug` · `Authorization: Bearer <token>`

## POST `/extra-groups/:id/bulk-assign`

Vincula o desvincula el grupo de extras `:id` con todos los productos de una categoría y, por defecto, de sus subcategorías. Solo cuenta productos de la misma marca del grupo (o de categorías globales sin sucursal).

- Permiso: `menu.gestionar_extras`
- Al vincular **no** modifica las asignaciones existentes ni sus `extraIds` puntuales; solo crea las que faltan con `extraIds = null` (todos los extras del grupo).
- Al desvincular borra la asignación del grupo en esos productos (incluidas las que tenían extras puntuales) y la regla automática de esas categorías.

### Request
```json
{
  "categoryId": 12,
  "includeSubcategories": true,
  "action": "link",
  "rememberForNewProducts": true,
  "dryRun": true
}
```
| Campo | Tipo | Requerido | Notas |
|---|---|---|---|
| `categoryId` | number | sí | Categoría o subcategoría |
| `includeSubcategories` | boolean | no | Default `true` |
| `action` | `"link"` \| `"unlink"` | sí | |
| `rememberForNewProducts` | boolean | no | Solo con `link`. Guarda una regla para que los productos que se creen, importen o muevan a la categoría reciban el grupo |
| `dryRun` | boolean | no | `true` = solo cuenta, no escribe (para confirmar en el panel) |

### Response 200
```json
{ "success": true, "data": { "matched": 112, "alreadyLinked": 3, "affected": 109 } }
```
- `matched`: productos encontrados en la(s) categoría(s).
- `alreadyLinked`: de esos, cuántos ya tenían el grupo.
- `affected`: los que se vinculan (`link`) o desvinculan (`unlink`).

### Errores
- `400` validación, grupo o categoría no encontrados, o categoría de otra marca.
- `401` sin token · `403` sin el permiso.

## GET `/extra-groups/:id/category-links`

Reglas automáticas del grupo. Permiso: `menu.gestionar_extras`.

```json
{ "success": true, "data": [{ "categoryId": 5, "categoryName": "Bebidas", "parentId": null, "includeSubcategories": true }] }
```

## DELETE `/extra-groups/:id/category-links/:categoryId`

Quita la regla automática. Los productos ya vinculados se quedan como están. Permiso: `menu.gestionar_extras`.

## Permisos del resto de rutas de extras

| Ruta | Permiso |
|---|---|
| `POST/PATCH/DELETE /extra-groups[/:id]`, `POST/PATCH/DELETE /extra-groups/:groupId/extras[/:id]` | `menu.gestionar_extras` |
| `POST /:id/extra-groups`, `DELETE /:id/extra-groups/:groupId` | `menu.gestionar_extras` o `menu.gestionar_productos` |
| Lecturas (`GET /extra-groups/all`, `/extra-groups/:id`, `/extra-groups/:id/products`, `/:id/extra-groups`) | Solo sesión |
