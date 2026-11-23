# Prompt — Web pública de ventas Grupo Carvallo (Claude Code)

> Copia y pega tal cual en Claude Code, junto con el spec (`files/reymen-retail-grupo-carvallo-spec.md`). El spec es el contexto, el prompt es la orden: primero el archivo, luego el prompt. Esta web es la Fase 2, se construye DESPUÉS de que la Fase 1 del módulo Retail (Codex) esté usable, o en paralelo solo si el inventario ya es una sola fuente de verdad.

---

```
You are Claude Code, working inside the ReymenSolutions/ReymenApp repository (Next.js, Prisma, PostgreSQL, Tailwind, multi-tenant).

TASK: Build the public sales web for Grupo Carvallo inside Reymen App. It is NOT a separate site disconnected from Reymen. It is the public entry of the Retail module.

SOURCE OF TRUTH:
Read first: `workspace/goals/labash-outlet-del-norte-casa-carballo-unified-system/files/reymen-retail-grupo-carvallo-spec.md`
That spec is authoritative. Do not invent photos, prices, products, services, figures, or testimonials beyond what it says. If the spec says TBD / pending, leave it TBD and do not fill it with placeholder data presented as real.

CONTEXT:
- Pilot client: Grupo Carvallo, Monterrey, N.L. — 3 businesses, ONE owner.
  Labash (premium clothing, ACTIVE), Outlet del Norte (casual / saldos, ACTIVE), Casa Carballo (home goods, INACTIVE, ready to activate, NOT in the pilot, do NOT show it as an operating store).
  Correction: Las Misiones does NOT exist as a store. Do NOT create a 4th store/page for it. Wholesale by pallet is a MODULE, not a store.
- One centralized web for the 3 businesses, connected to the SAME inventory as the POS and WhatsApp. Same price, same stock: if an item sells in the store, it disappears from the web at that moment.
- POS DECISION: POS Reymen, WITHOUT initial invoicing, ready to add it later. No CFDI stamping in the web/MVP.
- Brand: Reymen colours — deep navy, bright royal blue, white — matching the Reymen business card, real Reymen logo integrated as part of the banner itself, not a recreated logo pasted on top. Same criterion already used in the 1-page proposal.

WHAT TO BUILD:
- Public route inside Reymen App (do NOT create a separate repo / disconnected site).
- Home: the 3 businesses (Casa Carballo shown as coming soon / inactive, not as an operating store), what each sells, and a clear path to shop.
- Catalog: one unique item per card — photo, brand, size, color, style, price, location (Labash / Outlet del Norte), status. ONLY items with estado DISPONIBLE in the Retail module. A VENDIDA or APARTADA item must NOT be buyable.
- Item detail: larger photo, QR/code reference, channel, and a clear "Apartar por WhatsApp" action.
- Hold / buy flow: requesting/holding an item creates a RetailHold in the Retail module (with deadline and auto-release), and a purchase creates a RetailSale in the same inventory — never a separate stock. Every web request creates a Lead in the Reymen CRM (origin = web), without re-typing.
- Wholesale by pallet (Fase 3, prepare the route/structure, do not launch it as retail): closed pallet as a single lot product on a B2B web view, with hold deadline and auto-release. Do not sell pallet items one by one as retail.
- Search/filter by store, category, size, color, brand, price. Mobile-first — most requests will come from WhatsApp and social media.
- No checkout with invented payment methods. In Fase 2 the web is hold + WhatsApp confirmation; do not invent a payment gateway, shipping prices, or delivery times. If a payment/shipping field is needed, leave it TBD in the code/docs, not as a fake real value.

RULES:
- Do NOT invent photos (no stock photos presented as the group's garments), prices, piece counts, or store addresses. Use only confirmed data from the spec. Real photos are still TBD.
- Casa Carballo: do NOT assert stoves (not confirmed).
- Do NOT build CFDI invoicing, the Meta AI assistant, or personnel control in this web.
- Respect the Retail module activation: if RETAIL is not active for the organization, the web does not publish.
- Keep the docs updated (`docs/retail/`), and do not claim a step is done until it works against the real Retail inventory (same item, same stock as the POS).

ACCEPTANCE CRITERIA:
- The web lists only DISPONIBLE items from the Retail module, with the real price from the module.
- An item sold in the POS disappears from the web (same inventory, no duplicate stock).
- Requesting an item creates a RetailHold + a CRM Lead, with the item code attached.
- Casa Carballo is not shown as an operating store. Las Misiones does not appear as a store.
- No invented photo, price, address, or testimonial is published.
```
