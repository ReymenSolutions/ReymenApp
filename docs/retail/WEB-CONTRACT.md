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
| Tiendas | `Branch` + `RetailLocationSettings` (DEC-01): nombre, `type` (TIENDA/BODEGA), `format` (PREMIUM/OUTLET/HOGAR/BODEGA), `isActive` | Solo tiendas activas tipo TIENDA. Casa Carballo inactiva = «Próximamente», sin catálogo. La Bodega nunca aparece |
| Prenda | `RetailItem`: `id`, `code`, `brand`, `category`, `garmentType`, `size`, `color`, `style`, `salePrice`, `status`, `channel`, `locationId`, foto | Catálogo y detalle |
| Foto | Ruta servida por la app (DEC-03), no `Bytes` | Imagen de la tarjeta y del detalle |
| Descuento vigente | `RetailDiscountPlan` con `status = APLICADO`, vigente hoy, que aplique al canal web | Precio con descuento. Sin plan aprobado = precio normal |

**Nunca se leen ni se envían al navegador:** `cost`, márgenes, quién dio de alta, movimientos, ventas, clientes.

### Qué prendas se publican
- `status = DISPONIBLE`, en una tienda **activa** tipo TIENDA.
- `channel = MAYOREO` nunca sale en el catálogo de menudeo.
- **Pendiente (W-01):** ¿las prendas con `channel = TIENDA` también salen en la web, o solo las `EN_LINEA`? El spec dice «mismo stock: si se vende en tienda, desaparece de la web», lo que sugiere que sí salen. Lo confirma Reynol o Emi.

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
- **El número de WhatsApp de cada tienda es TBD**: sin él, el botón no se muestra.
- Mayoreo (Fase 3): solo se deja la ruta preparada, sin publicar.
