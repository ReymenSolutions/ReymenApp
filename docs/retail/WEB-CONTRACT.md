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
| Tiendas | `Branch` + `RetailLocationSettings` (DEC-01): nombre, `type` (TIENDA/BODEGA), `format` (PREMIUM/OUTLET/HOGAR/BODEGA), `isActive`, **`whatsappPhone`** (WhatsApp de la tienda para apartar; TBD hasta que lo dé el cliente) | Solo tiendas activas tipo TIENDA. Casa Carballo inactiva = «Próximamente», sin catálogo. La Bodega nunca aparece |
| Prenda | `RetailItem`: `id`, `code`, `brand`, `category`, `garmentType`, `size`, `color`, `style`, `salePrice`, `status`, `channel`, `locationId`, foto | Catálogo y detalle |
| Foto | Ruta servida por la app (DEC-03), no `Bytes` | Imagen de la tarjeta y del detalle |
| Descuento vigente | `RetailDiscountPlan` con `status = APLICADO`, vigente hoy, que aplique al canal web | Precio con descuento. Sin plan aprobado = precio normal |

**Nunca se leen ni se envían al navegador:** `cost`, márgenes, quién dio de alta, movimientos, ventas, clientes.

### Qué prendas se publican
- `status = DISPONIBLE`, en una tienda **activa** tipo TIENDA.
- `channel = MAYOREO` nunca sale en el catálogo de menudeo.
- **W-01 (resuelta 23 nov 2026, opción A):** salen las prendas DISPONIBLES de canal `TIENDA` **y** `EN_LINEA`, solo si tienen foto. Implementado en `isPublishable` (`src/lib/retail/public/catalog.ts`).
- La ruta pública resuelve la organización desde el `slug` en el servidor; no acepta `organizationId` del navegador. La consulta selecciona solo campos públicos y usa la misma fila `RetailItem` del POS.

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

## 4. Estado de la implementación de la web (Claude Code)
- Hecho (sin datos reales todavía):
  - rutas `src/app/tienda/[slug]/` (inicio, `catalogo`, `prenda/[code]`);
  - reglas puras y pruebas en `src/lib/retail/public/catalog.ts`;
  - acción pública de apartar en `src/lib/retail/public/actions.ts` (límite por IP y teléfono);
  - componentes en `src/components/retail-public/`;
  - ruta pública en `src/proxy.ts`.
- Marca: logo **RM** del repo (`src/app/icon.png`, servido como `/icon.png`), azul marino y azul rey (tokens `.rt` en `globals.css`).
- **Único punto por conectar:** `src/lib/retail/public/source.ts`. Hoy `getStorefront` devuelve `null` (la tienda da 404) y `requestHold` responde `NOT_READY`. Cuando Codex entregue `RetailItem`, `RetailLocationSettings` y `createHold`, se implementan ahí siguiendo las instrucciones del propio archivo.

## 5. Integración pendiente con el núcleo

Antes de conectar `source.ts`, adaptar `src/lib/retail/public/actions.ts` y `source.ts` a `requester` y `requestKey`. Una repetición de la misma solicitud debe devolver el mismo apartado y no crear otro Lead. Confirmar el filtro por organización y campos públicos, comprobar concurrencia y mantener `NOT_READY` hasta configurar el plazo I-03 y probar el recorrido en `apptest`.
