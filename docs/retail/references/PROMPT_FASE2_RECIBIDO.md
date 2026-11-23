# Prompt — Fase 2 Reymen Retail: WhatsApp + Lealtad + Indicadores (Codex)

> Copia y pega tal cual en Codex dentro del repo ReymenSolutions/ReymenApp, junto con el spec (`files/reymen-retail-grupo-carvallo-spec.md`). Solo después de que la Fase 1 esté aceptada. El spec es el contexto, el prompt es la orden: primero el archivo, luego el prompt.

---

```
You are Codex, working inside the ReymenSolutions/ReymenApp repository (Next.js, Prisma, PostgreSQL, Tailwind, multi-tenant).

TASK: Build Fase 2 of the Reymen Retail module: WhatsApp with AI agent + Loyalty + full indicators. Do NOT rebuild Fase 1. Do NOT build Fase 3.

PREREQUISITE — VERIFY FIRST:
- Fase 1 must already be accepted: /portal/retail works, RetailItem with unique code + QR, QR movements, POS without invoicing, holds with auto-release, approved discounts only, daily cut, GESEM Excel import.
- If any Fase 1 acceptance criterion fails, stop and report which one fails. Do not start Fase 2 on top of a broken Fase 1.

SOURCE OF TRUTH:
Read first: `workspace/goals/labash-outlet-del-norte-casa-carballo-unified-system/files/reymen-retail-grupo-carvallo-spec.md`
That spec is authoritative, including its Fase 2 section and Fase 2 acceptance criteria. Do not invent prices, costs, piece counts, seller names, store addresses, loyalty point rules, or campaign results beyond what it says. If the spec says TBD / pending, leave it TBD and do not fill it with placeholder data presented as real.

CONTEXT:
- Pilot client: Grupo Carvallo, Monterrey, N.L. — 3 businesses, ONE owner.
  Labash (premium clothing, ACTIVE), Outlet del Norte (casual / saldos, ACTIVE), Casa Carballo (home goods, INACTIVE, ready to activate, NOT in the pilot).
  Correction: Las Misiones does NOT exist as a store. Do NOT create a 4th location for it. Wholesale by pallet is a MODULE, not a store.
- The public sales web is built separately by Claude Code (Fase 2, same spec). Your work must share the SAME inventory as the POS and the web: one item, one stock. Never create a second stock.
- POS DECISION: POS Reymen, WITHOUT initial invoicing, ready to add it later. No CFDI stamping in Fase 2.
- Team: Reynol (architecture/DB/AI prompts/n8n) and Emiliano (commercial/owner relation/GESEM liaison/Meta access) are equal-level partners and decide together. Lance is an intern (cataloguing, Excel cleaning, QA, docs).

1. WHATSAPP WITH AI AGENT — REUSE AI_WHATSAPP, DO NOT BUILD A NEW CHAT SYSTEM
- Reuse the existing AI_WHATSAPP module (agent, conversations, inbox). Retail adds only the retail logic on top of it.
- The agent can: consult availability of a specific item by code/brand/size/color, show price, create a RetailHold with deadline, confirm a sale, and answer stock questions. It must never sell a VENDIDA item or one APARTADA by another client.
- A WhatsApp hold creates a RetailHold (itemId, clienteId from CRM, canal WHATSAPP, venceEn, estado ACTIVO). On expiry it auto-releases the item to DISPONIBLE with a LIBERACION_APARTADO movement.
- A WhatsApp sale creates a RetailSale + RetailSaleItem in the SAME transaction as the POS and web sales: item -> VENDIDA + movement VENTA + cash INGRESO in one step. If POS, WhatsApp and web try to sell the same item at the same time, only one completes; the other is rejected and recorded as an attempted double sale.
- Conversation definition: a Reymen conversation = a Reymen attention session of up to 24 hours per contact, counted from the first message of that session. It is NOT defined by Meta's billing window. Meta's and Twilio/BSP's billing criteria are separate, at their own current tariffs. The 500/month included in the plan covers only the Reymen platform and AI agent execution.
- Payment: the POS only registers the payment method and amount, it does NOT process card payments. WhatsApp sales are hold + confirmation: payment confirmed in store or by verified transfer before delivery. No payment gateway, no shipping calculation, no online returns in Fase 2.
- Delivery: pickup in store only (Labash / Outlet del Norte). No home delivery in Fase 2.

2. LOYALTY — REUSE CRM + LOYALTY, DO NOT CREATE A NEW PERSON TABLE
- Reuse CRM Customer / Lead and the existing LOYALTY module (programs, members, visits, rewards). Retail creates NO person table.
- Loyalty records per client: clienteId, frecuenciaCompra, ticketPromedio, ultimaVisita, beneficios. Points rule is TBD in the spec — do NOT invent a points rule; leave it configurable / TBD in code and docs.
- A sale with a clienteId updates frequency, ticket and last visit. An anonymous retail sale (no clienteId) is valid and does not create a fake loyalty member.
- Every web/WhatsApp request already creates a CRM Lead (origin = web / whatsapp) without re-typing; keep that behaviour, do not duplicate leads.

3. FULL INDICATORS — ALL CALCULATED FROM DATA, NOTHING TYPED BY HAND
- Build on the Fase 1 dashboard (daily sales, gross margin, contribution per item, per store and consolidated, with day/week/month/year filters).
- Two separate metrics, do NOT merge them and do NOT call the second one gross margin:
  - Margen bruto comercial = (precio de venta - descuento aplicado) - costo de adquisición.
  - Contribución operativa por prenda = margen bruto comercial - comisión de pago; returns subtract.
  - Contribución operativa is Reymen's own operational metric, NOT net profit and NOT accounting profit: it excludes rent, salaries, electricity, ad spend and other business expenses.
  - If an item has no registered cost, the dashboard marks it "sin costo" and it does not enter these metrics.
- Add, all calculated from sales, movements and costs:
  - Piezas por m² per location (requires m2 per location; if m2 is missing, show "por confirmar", do not invent it).
  - Días de permanencia per item and per category (today minus fechaIngreso).
  - Rotación (sales / average inventory in the period).
  - Excedentes (items with many days without selling, threshold configurable, do NOT invent a fixed number).
  - Necesidades de reabastecimiento (below minimum per category/size, minimum configurable).
  - Ventas por vendedor, por canal (POS / WHATSAPP / WEB) and per store.
  - Dobles ventas intentadas (rejected by the system) — counter, to validate that the control works.
- Discount scenarios Plan A/B/C show both metrics (margen bruto comercial and contribución operativa).

WORK METHOD:
1. Verify Fase 1 acceptance criteria pass before writing Fase 2 code; report any failure first.
2. Then implement in this order: (1) WhatsApp agent retail actions (consult / hold / sell) on the same inventory transaction, (2) Loyalty on CRM + LOYALTY (frequency, ticket, last visit), (3) full indicators on the dashboard, (4) multichannel acceptance test (see below).
3. Keep docs updated in `docs/retail/` (PRD.md, ARCHITECTURE.md, DATABASE.md, API.md, SECURITY.md, TASKS.md, PROGRESS.md, DECISIONS.md, HANDOFF.md) so another agent can continue without rework if you run out of tokens.
4. Do not claim a step is done until its acceptance criterion in the spec passes.

ACCEPTANCE CRITERIA (Fase 2, from spec):
- An item sold in store disappears from the web in the same moment (same transaction / same inventory).
- WhatsApp can hold and sell without double sale: a hold by one client blocks the item for others until expiry, then auto-releases it.
- A WhatsApp sale and a web sale of the same item at the same time result in exactly one completed sale; the other is rejected and counted.
- Loyalty registers frequency and ticket per client; an anonymous sale does not create a fake member.
- The dashboard shows piezas por m², días de permanencia, rotación, excedentes and reabastecimiento, all calculated from data, with the two margin metrics separated as defined above.
- Casa Carballo stays inactive and does not appear as an operating store; activating it is a status change, not a migration.

Do NOT build in Fase 2: CFDI stamping, the Meta AI assistant, full personnel control, or the pallet module (Fase 3). Do not create a 4th store. Do not invent seller names, prices, costs, piece counts, loyalty point rules, or campaign results.
```
