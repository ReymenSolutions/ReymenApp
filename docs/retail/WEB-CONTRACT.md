# Contrato web pública ↔ módulo Retail

Qué necesita la web pública de ventas (Claude Code) del núcleo del módulo `RETAIL` (Codex). Así cada uno trabaja en sus
carpetas sin pisarse (ver `DECISIONS.md` § Reparto de trabajo). Nombres en inglés para el código, como el resto del
repo; si Codex usa otros nombres al implementar, se actualiza este archivo en el mismo PR.

## 1. Lo que la web LEE (solo lectura)

La web consulta directo con Prisma, siempre filtrando por `organizationId`, desde `src/lib/retail/public/*`.

| Dato | Origen esperado | Uso en la web |
|---|---|---|
| Módulo activo | `hasModule(orgId, "RETAIL")` | Sin RETAIL la web no publica (404) |
| Organización | `Organization.slug` | URL: `/tienda/<slug>` |
| Tiendas | `Branch` + `RetailLocationSettings` (DEC-01): nombre, `type` (TIENDA/BODEGA), `format` (PREMIUM/OUTLET/HOGAR/BODEGA), `isActive`, `whatsappPhone` configurable | Solo tiendas activas tipo TIENDA. Casa Carballo inactiva = «Próximamente», sin catálogo. La Bodega nunca aparece |
| Prenda | `RetailItem`: `id`, `code`, `brand`, `category`, `garmentType`, `size`, `color`, `style`, `salePrice`, `status`, `channel`, `locationId`, foto | Catálogo y detalle |
| Foto | Ruta servida por la app (DEC-03), no `Bytes` | Imagen de la tarjeta y del detalle |
| Descuento vigente | `RetailDiscountPlan` con `status = APLICADO`, vigente hoy, que aplique al canal web | Precio con descuento. Sin plan aprobado = precio normal |

**Nunca se leen ni se envían al navegador:** `cost`, márgenes, quién dio de alta, movimientos, ventas, clientes.

### Qué prendas se publican
- `status = DISPONIBLE`, en una tienda **activa** tipo TIENDA. `channel = MAYOREO` nunca sale en el catálogo de menudeo.
- **Pendiente (W-01):** confirmar si se publican solo prendas `EN_LINEA` o también `TIENDA`. Mientras esté abierto, no publicar el catálogo. Cualquiera que se publique usa la **misma fila `RetailItem`** que el POS: si se vende en tienda, desaparece de la web.
- La ruta pública usa el `slug` para resolver una organización fija en el servidor; no recibe `organizationId` del navegador. La consulta selecciona solo campos públicos. Nunca envía `cost`, margen, datos personales ni identificadores de personal.

## 2. Lo que la web LLAMA (escritura, implementada por Codex en el núcleo)

Una sola función del núcleo; la web no escribe tablas de inventario por su cuenta.

```ts
// src/lib/retail/holds.ts (Codex)
createHold(input: {
  organizationId: string;                        // lo resuelve el servidor desde el slug, nunca el navegador
  itemId: string;
  channel: "WEB";
  requestKey: string;                           // idempotencia para reintentos
  requester: { name: string; phone: string };   // datos declarados, identidad no verificada
}): Promise<
  | { ok: true; holdId: string; expiresAt: Date; itemCode: string }
  | { ok: false; reason: "NOT_AVAILABLE" | "MODULE_DISABLED" }
>
```

Reglas que garantiza el núcleo, no la web:
- Transacción atómica: la pieza pasa a APARTADA solo si estaba DISPONIBLE; si no, `NOT_AVAILABLE` y se registra el intento.
- Vencimiento con auto-liberación. El plazo del apartado es **TBD** y vive en la configuración del módulo, no en la web.
- Crea un `Lead` del CRM con origen web y el código de la prenda; lo vincula al apartado. **No busca ni enlaza automáticamente un `Customer` existente por teléfono**. Una compra confirmada requiere verificación humana o un mecanismo de identidad aprobado antes de asociar historial y Lealtad.
- El núcleo limita reintentos y valida formato, tamaño y origen en la ruta pública. El plazo del apartado se configura antes de publicar; hasta entonces el endpoint permanece cerrado.

## 3. Lo que hace la web con eso
- Inicio: las tiendas activas (Labash, Outlet del Norte), Casa Carballo como «Próximamente» y acceso al catálogo.
- Catálogo con filtros (tienda, categoría, talla, color, marca, precio). Mobile-first.
- Detalle con foto grande, código y botón **«Apartar por WhatsApp»**. Llama a `createHold` y abre WhatsApp con el código y el vencimiento.
- **El número de WhatsApp de cada tienda es TBD**: sin él, el botón no se muestra.
- Mayoreo (Fase 3): solo se deja la ruta preparada, sin publicar.

## Integración con el PR #194 de Claude

El PR [#194](https://github.com/ReymenSolutions/ReymenApp/pull/194) ya contiene la estructura de la web. Su `source.ts` devuelve `null`/`NOT_READY`, por lo que no ofrece apartados reales. Antes de conectar el núcleo:

1. Conciliar W-01: el PR #194 implementa la opción A (`TIENDA` + `EN_LINEA`); la decisión aún requiere confirmación del negocio antes de publicar el catálogo.
2. Adaptar `src/lib/retail/public/actions.ts` y `source.ts` a `requester` y `requestKey` del contrato anterior. Una repetición de la misma solicitud debe devolver el mismo apartado y no crear otro Lead.
3. Confirmar que `getStorefront` resuelva la organización desde el slug, aplique entitlement y seleccione campos públicos. Asegurar que `requestHold` verifique que la pieza sigue disponible para esa organización en la transacción.
4. Mantener `NOT_READY` hasta confirmar W-04, número de WhatsApp, pruebas de concurrencia y recorrido en `apptest`.
