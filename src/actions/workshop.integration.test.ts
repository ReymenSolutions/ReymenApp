// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import sharp from "sharp";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { createWorkshopVehicle, createWorkshopQuote, issueWorkshopQuote, markWorkshopQuoteSent, approveWorkshopQuote, convertWorkshopQuote, createWorkshopPart, createWorkshopPurchase, getWorkshopPartStock, saveWorkshopReception, advanceWorkshopOrder, recordWorkshopOrderPayment, authorizeWorkshopCredit, deliverWorkshopOrder } = await import("./workshop");
const { GET: downloadQuotePdf } = await import("@/app/api/workshop/quotes/[id]/pdf/route");
const { POST: uploadPhoto } = await import("@/app/api/workshop/orders/[id]/photos/route");
const { GET: readPhoto } = await import("@/app/api/workshop/photos/[id]/route");

describe("workshop tenant integration", () => {
  let orgA: { id: string };
  let orgB: { id: string };
  let customerA: { id: string };
  let customerB: { id: string };
  let quoteId: string;
  let ownerId: string;

  beforeAll(async () => {
    orgA = await createTestOrg("Workshop A");
    orgB = await createTestOrg("Workshop B");
    await prisma.organizationModule.create({ data: { organizationId: orgA.id, module: "WORKSHOP", status: "ACTIVE", source: "ADMIN_GRANTED" } });
    customerA = await prisma.customer.create({ data: { organizationId: orgA.id, phone: "+528110000001", phoneKey: "8110000001", name: "Client A" } });
    customerB = await prisma.customer.create({ data: { organizationId: orgB.id, phone: "+528110000002", phoneKey: "8110000002", name: "Client B" } });
    ownerId = (await createTestUser(orgA.id, "OWNER", "workshop-owner")).id;
    auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } });
  });

  afterAll(async () => {
    if (orgA) {
      await prisma.workshopPhoto.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopCashMovement.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopInventoryMovement.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopPurchaseLine.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopPurchase.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopOrderItem.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopWorkOrder.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopQuoteItem.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopQuote.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopVehicle.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopPart.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopFolioCounter.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.organizationModule.deleteMany({ where: { organizationId: orgA.id, module: "WORKSHOP" } });
      await prisma.customer.deleteMany({ where: { organizationId: orgA.id } });
      await cleanupOrg(orgA.id);
    }
    if (orgB) {
      await prisma.workshopVehicle.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.customer.deleteMany({ where: { organizationId: orgB.id } });
      await cleanupOrg(orgB.id);
    }
  });

  it("rejects a customer from another organization", async () => {
    await expect(createWorkshopVehicle({ customerId: customerB.id, placas: "WRONG1", vin: "1HGCM82633A004352", marca: "Honda", modelo: "Accord", anio: "2020", kilometrajeActual: "10" })).rejects.toThrow(/organización/i);
  });

  it("creates a CRM-linked vehicle and a net-priced quote only in the session organization", async () => {
    const vehicle = await createWorkshopVehicle({ customerId: customerA.id, placas: "WOLF1", vin: "1HGCM82633A004352", marca: "Honda", modelo: "Accord", anio: "2020", kilometrajeActual: "30000" });
    const quote = await createWorkshopQuote({ vehicleId: vehicle.id, servicioTitulo: "Cambio de aceite", items: [{ tipo: "SERVICIO", concepto: "Cambio de aceite", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "100.00", costoUnitarioNeto: "60.00" }] });
    quoteId = quote.id;
    const saved = await prisma.workshopQuote.findUniqueOrThrow({ where: { id: quote.id }, include: { items: true } });
    expect(saved.organizationId).toBe(orgA.id);
    expect(saved.customerId).toBe(customerA.id);
    expect(saved.folio).toBeNull();
    expect(saved.total.toFixed(2)).toBe("116.00");
    expect(saved.utilidadNeta?.toFixed(2)).toBe("40.00");
    expect(saved.items).toHaveLength(1);
    expect(await prisma.workshopQuote.count({ where: { organizationId: orgB.id } })).toBe(0);
  });

  it("rejects a quote for another organization's vehicle", async () => {
    const otherVehicle = await prisma.workshopVehicle.create({ data: { organizationId: orgB.id, customerId: customerB.id, placas: "OTHER1", vin: "2HGCM82633A004352" } });
    await expect(createWorkshopQuote({ vehicleId: otherVehicle.id, servicioTitulo: "Cambio de aceite", items: [{ tipo: "SERVICIO", concepto: "Cambio de aceite", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "100.00" }] })).rejects.toThrow(/organización/i);
    expect(await prisma.workshopQuote.count({ where: { organizationId: orgA.id, vehicleId: otherVehicle.id } })).toBe(0);
  });

  it("issues one folio only with complete identity and serves an authorized PDF", async () => {
    await prisma.customer.update({ where: { id: customerA.id }, data: { name: null } });
    await expect(issueWorkshopQuote(quoteId)).rejects.toThrow(/Completa nombre/i);
    await prisma.customer.update({ where: { id: customerA.id }, data: { name: "Client A" } });
    const first = await issueWorkshopQuote(quoteId);
    const second = await issueWorkshopQuote(quoteId);
    expect(first.folio).toMatch(/^TW-\d{4}-0001$/);
    expect(second.folio).toBe(first.folio);
    const response = await downloadQuotePdf(new Request("http://localhost/api/workshop/quotes/x/pdf"), { params: Promise.resolve({ id: quoteId }) });
    expect(response.status).toBe(200);
    expect(Buffer.from(await response.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
    const otherResponse = await downloadQuotePdf(new Request("http://localhost/api/workshop/quotes/x/pdf"), { params: Promise.resolve({ id: "does-not-belong-here" }) });
    expect(otherResponse.status).toBe(404);
  });

  it("requires recorded approval and converts the quote exactly once", async () => {
    await expect(convertWorkshopQuote(quoteId)).rejects.toThrow(/aprobada/i);
    await markWorkshopQuoteSent(quoteId);
    await approveWorkshopQuote(quoteId, "WhatsApp");
    const results = await Promise.allSettled([convertWorkshopQuote(quoteId), convertWorkshopQuote(quoteId)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const order = await prisma.workshopWorkOrder.findUniqueOrThrow({ where: { quoteId }, include: { items: true } });
    expect(order.items).toHaveLength(1);
    expect(order.saldo.toFixed(2)).toBe("116.00");
    expect(await prisma.workshopWorkOrder.count({ where: { quoteId } })).toBe(1);
    expect((await prisma.workshopQuote.findUniqueOrThrow({ where: { id: quoteId } })).estado).toBe("CONVERTIDA");
  });

  it("expires a quote past its validity instead of allowing approval or conversion", async () => {
    const vehicle = await prisma.workshopVehicle.findFirstOrThrow({ where: { organizationId: orgA.id } });
    const quote = await createWorkshopQuote({ vehicleId: vehicle.id, servicioTitulo: "Diagnóstico", items: [{ tipo: "SERVICIO", concepto: "Diagnóstico", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "100.00" }] });
    await issueWorkshopQuote(quote.id);
    await markWorkshopQuoteSent(quote.id);
    await prisma.workshopQuote.update({ where: { id: quote.id }, data: { enviadaEn: new Date(Date.now() - 16 * 86_400_000) } });
    await expect(approveWorkshopQuote(quote.id, "WhatsApp")).rejects.toThrow(/venció/i);
    expect((await prisma.workshopQuote.findUniqueOrThrow({ where: { id: quote.id } })).estado).toBe("VENCIDA");
    await expect(convertWorkshopQuote(quote.id)).rejects.toThrow(/aprobada/i);
  });

  it("derives stock from purchase movements and records paid purchases once in cash", async () => {
    const part = await createWorkshopPart({ sku: "OIL-FILTER", nombre: "Filtro de aceite", unidad: "pza", costoNeto: "50.00", precioVentaNeto: "100.00", stockMinimo: "2" });
    const requestKey = crypto.randomUUID();
    const input = { requestKey, proveedor: "Proveedor local", paid: true, method: "EFECTIVO" as const, lines: [{ partId: part.id, cantidad: "3", costoUnitarioNeto: "50.00" }] };
    const first = await createWorkshopPurchase(input);
    const retry = await createWorkshopPurchase(input);
    expect(retry.id).toBe(first.id);
    expect(await getWorkshopPartStock(part.id)).toBe("3");
    expect(await prisma.workshopInventoryMovement.count({ where: { organizationId: orgA.id, purchaseId: first.id } })).toBe(1);
    const cash = await prisma.workshopCashMovement.findMany({ where: { organizationId: orgA.id, purchaseId: first.id } });
    expect(cash).toHaveLength(1);
    expect(cash[0].monto.toFixed(2)).toBe("174.00");
  });

  it("requires photos and stock, records a payment once, and blocks delivery until credit is explicit", async () => {
    const vehicle = await prisma.workshopVehicle.findFirstOrThrow({ where: { organizationId: orgA.id } });
    const part = await prisma.workshopPart.findFirstOrThrow({ where: { organizationId: orgA.id } });
    const quote = await createWorkshopQuote({ vehicleId: vehicle.id, servicioTitulo: "Servicio con refacción", items: [{ tipo: "REFACCION", partId: part.id, concepto: "Filtro de aceite", cantidad: "4", unidad: "pza", precioUnitarioNeto: "100.00", costoUnitarioNeto: "50.00" }] });
    await issueWorkshopQuote(quote.id); await markWorkshopQuoteSent(quote.id); await approveWorkshopQuote(quote.id, "WhatsApp");
    const order = await convertWorkshopQuote(quote.id);
    await expect(advanceWorkshopOrder(order.id, "DIAGNOSTICO")).rejects.toThrow(/fotos/i);
    await saveWorkshopReception(order.id, { kilometrajeIngreso: 30000, nivelCombustible: "medio", fallaReportada: "Cambio de filtro", danosPrevios: "ninguno", testigos: "ninguno", pertenencias: "ninguna" });
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    async function addPhoto(phase: string) {
      const form = new FormData(); form.set("phase", phase); form.set("file", new File([png], "photo.png", { type: "image/png" }));
      return uploadPhoto(new Request(`http://localhost/api/workshop/orders/${order.id}/photos`, { method: "POST", headers: { origin: "http://localhost" }, body: form }), { params: Promise.resolve({ id: order.id }) });
    }
    expect((await addPhoto("RECEPCION")).status).toBe(201);
    await advanceWorkshopOrder(order.id, "DIAGNOSTICO");
    await saveWorkshopReception(order.id, { kilometrajeIngreso: 30000, nivelCombustible: "medio", fallaReportada: "Cambio de filtro", diagnostico: "Filtro requiere reemplazo", danosPrevios: "ninguno", testigos: "ninguno", pertenencias: "ninguna" });
    await expect(advanceWorkshopOrder(order.id, "EN_REPARACION")).rejects.toThrow(/existencias/i);
    await createWorkshopPurchase({ requestKey: crypto.randomUUID(), proveedor: "Proveedor local", paid: false, lines: [{ partId: part.id, cantidad: "1", costoUnitarioNeto: "50.00" }] });
    await advanceWorkshopOrder(order.id, "EN_REPARACION");
    expect(await getWorkshopPartStock(part.id)).toBe("0");
    await expect(advanceWorkshopOrder(order.id, "EN_REPARACION")).rejects.toThrow(/Transición/i);
    expect((await addPhoto("PROCESO")).status).toBe(201);
    await advanceWorkshopOrder(order.id, "LISTA_PARA_ENTREGA");
    expect((await addPhoto("ENTREGA")).status).toBe(201);
    await expect(deliverWorkshopOrder(order.id, 30001, true)).rejects.toThrow(/saldo/i);
    const paymentKey = crypto.randomUUID();
    const payment = await recordWorkshopOrderPayment(order.id, { requestKey: paymentKey, monto: "400.00", metodo: "EFECTIVO" });
    expect((await recordWorkshopOrderPayment(order.id, { requestKey: paymentKey, monto: "400.00", metodo: "EFECTIVO" })).id).toBe(payment.id);
    expect((await prisma.workshopWorkOrder.findUniqueOrThrow({ where: { id: order.id } })).saldo.toFixed(2)).toBe("64.00");
    await authorizeWorkshopCredit(order.id, "Pago restante en siete días");
    await deliverWorkshopOrder(order.id, 30001, true);
    expect((await prisma.workshopWorkOrder.findUniqueOrThrow({ where: { id: order.id } })).estado).toBe("ENTREGADA");
    await expect(saveWorkshopReception(order.id, { kilometrajeIngreso: 30001, nivelCombustible: "medio", fallaReportada: "Editar", danosPrevios: "", testigos: "", pertenencias: "" })).rejects.toThrow(/no disponible/i);
    const photo = await prisma.workshopPhoto.findFirstOrThrow({ where: { organizationId: orgA.id, workOrderId: order.id } });
    const response = await readPhoto(new Request("http://localhost/photo"), { params: Promise.resolve({ id: photo.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("blocks other organizations and unauthorized roles from PDFs and photos", async () => {
    const quote = await prisma.workshopQuote.findUniqueOrThrow({ where: { id: quoteId } });
    const photo = await prisma.workshopPhoto.findFirstOrThrow({ where: { organizationId: orgA.id } });
    try {
      auth.mockResolvedValue({ user: { id: ownerId, role: "AGENT", organizationId: orgA.id } });
      expect((await downloadQuotePdf(new Request("http://localhost/quote"), { params: Promise.resolve({ id: quote.id }) })).status).toBe(403);
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgB.id } });
      expect((await downloadQuotePdf(new Request("http://localhost/quote"), { params: Promise.resolve({ id: quote.id }) })).status).toBe(403);
      expect((await readPhoto(new Request("http://localhost/photo"), { params: Promise.resolve({ id: photo.id }) })).status).toBe(403);
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } });
      expect((await readPhoto(new Request("http://localhost/photo"), { params: Promise.resolve({ id: "other-org-photo" }) })).status).toBe(404);
    } finally {
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } });
    }
  });
});
