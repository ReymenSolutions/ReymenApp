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
| Tiendas | `Branch` + `RetailLocationSettings` (DEC-01): nombre, `type` (TIENDA/BODEGA), `format` (PREMIUM/OUTLET/HOGAR/BODEGA), `isActive`, **`whatsappPhone`** (WhatsApp de la tienda para apartar; ver § 3) | Solo tiendas activas tipo TIENDA. Casa Carballo inactiva = «Próximamente», sin catálogo. La Bodega nunca aparece |
| Prenda | `RetailItem`: `id`, `code`, `brand`, `category`, `garmentType`, `size`, `color`, `style`, `salePrice`, `status`, `channel`, `locationId`, foto | Catálogo y detalle |
| Foto | Ruta servida por la app (DEC-03), no `Bytes` | Imagen de la tarjeta y del detalle |
| Descuento vigente | `RetailDiscountPlan` con `status = APLICADO`, vigente hoy, que aplique al canal web | Precio con descuento. Sin plan aprobado = precio normal |

**Nunca se leen ni se envían al navegador:** `cost`, márgenes, quién dio de alta, movimientos, ventas, clientes.

### Qué prendas se publican
- `status = DISPONIBLE`, en una tienda **activa** tipo TIENDA.
- `channel = MAYOREO` nunca sale en el catálogo de menudeo.
- **W-01 (resuelta 23 nov 2026, opción A):** salen las prendas DISPONIBLES de canal `TIENDA` **y** `EN_LINEA`, solo si tienen foto. Implementado en `isPublishable` (`src/lib/retail/public/catalog.ts`).

## 2. Lo que la web LLAMA (escritura, implementada por Codex en el núcleo)

Una sola función del núcleo; la web no escribe tablas de inventario por su cuenta.

```ts
// src/lib/retail/holds.ts (Codex)
createHold(input: {
  organizationId: string;
  itemId: string;
  channel: "WEB" | "WHATSAPP" | "TIENDA";
  customer: { name: string; phone: string };   // se busca o crea en el CRM (Customer + Lead), sin recaptura
  leadSource?: string;                          // "web"
}): Promise<
  | { ok: true; holdId: string; expiresAt: Date; itemCode: string }
  | { ok: false; reason: "NOT_AVAILABLE" | "MODULE_DISABLED" }
>
```

Reglas que garantiza el núcleo, no la web:
- Transacción atómica: la pieza pasa a APARTADA solo si estaba DISPONIBLE; si no, `NOT_AVAILABLE` y se registra el intento.
- Vencimiento con auto-liberación. El plazo del apartado es **TBD** y vive en la configuración del módulo, no en la web.
- Crea o vincula el `Lead` del CRM con origen web y el código de la prenda.

## 3. Lo que hace la web con eso
- Inicio: las tiendas activas (Labash, Outlet del Norte), Casa Carballo como «Próximamente» y acceso al catálogo.
- Catálogo con filtros (tienda, categoría, talla, color, marca, precio). Mobile-first.
- Detalle con foto grande, código y botón **«Apartar por WhatsApp»**. Llama a `createHold` y abre WhatsApp con el código y el vencimiento.
- **WhatsApp de cada tienda (W-03, confirmados):** Labash **81 1420 6868**, Outlet del Norte **81 3384 7842**. Codex los carga en `RetailLocationSettings.whatsappPhone` al crear las tiendas (semilla o Configuración). Casa Carballo: sin número (inactiva). Una tienda sin número no muestra el botón.
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
