// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import sharp from "sharp";
import { PDFDocument } from "pdf-lib";

const auth = vi.fn();
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logAudit: vi.fn() }));

const { createWorkshopVehicle, createWorkshopQuote, issueWorkshopQuote, markWorkshopQuoteSent, approveWorkshopQuote, convertWorkshopQuote, createWorkshopPart, createWorkshopPurchase, getWorkshopPartStock, saveWorkshopReception, advanceWorkshopOrder, addWorkshopAuthorizedLine, recordWorkshopOrderPayment, authorizeWorkshopCredit, deliverWorkshopOrder, setWorkshopInvoiceRequested, saveWorkshopSettings, setWorkshopNextService, saveWorkshopService } = await import("./workshop");
const { seedWorkshopServices } = await import("@/lib/workshop/services");
const { GET: downloadQuotePdf } = await import("@/app/api/workshop/quotes/[id]/pdf/route");
const { GET: downloadOrderPdf } = await import("@/app/api/workshop/orders/[id]/pdf/route");
const { POST: uploadPhoto } = await import("@/app/api/workshop/orders/[id]/photos/route");
const { GET: readPhoto } = await import("@/app/api/workshop/photos/[id]/route");
const { submitWolfInquiry, wolfInquirySchema, getWolfLandingOrg } = await import("@/lib/workshop/landing");
const { createWorkshopVehicleFromRequest, markWorkshopRequestViewed, discardWorkshopRequest } = await import("./workshop");
const { POST: submitPublicInquiry } = await import("@/app/api/workshop/public/inquiries/route");

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
    await prisma.organizationModule.create({ data: { organizationId: orgB.id, module: "WORKSHOP", status: "ACTIVE", source: "ADMIN_GRANTED" } });
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
      await prisma.workshopLeadRequest.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopVehicle.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopPart.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopFolioCounter.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopSettings.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.workshopService.deleteMany({ where: { organizationId: orgA.id } });
      await prisma.organizationModule.deleteMany({ where: { organizationId: orgA.id, module: "WORKSHOP" } });
      await prisma.customer.deleteMany({ where: { organizationId: orgA.id } });
      await cleanupOrg(orgA.id);
    }
    if (orgB) {
      await prisma.workshopVehicle.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.workshopSettings.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.workshopService.deleteMany({ where: { organizationId: orgB.id } });
      await prisma.organizationModule.deleteMany({ where: { organizationId: orgB.id, module: "WORKSHOP" } });
      await prisma.customer.deleteMany({ where: { organizationId: orgB.id } });
      await cleanupOrg(orgB.id);
    }
  });

  it("rejects a customer from another organization", async () => {
    await expect(createWorkshopVehicle({ customerId: customerB.id, placas: "WRONG1", vin: "1HGCM82633A004352", marca: "Honda", modelo: "Accord", anio: "2020", kilometrajeActual: "10" })).rejects.toThrow(/organización/i);
  });

  it("seeds provisional services without prices and permits tenant-only edits", async () => {
    await prisma.$transaction((tx) => seedWorkshopServices(tx, orgA.id));
    expect(await prisma.workshopService.count({ where: { organizationId: orgA.id } })).toBe(11);
    const item = await prisma.workshopService.findFirstOrThrow({ where: { organizationId: orgA.id } });
    expect(item.precioVentaNeto).toBeNull();
    expect(item.costoNeto).toBeNull();
    await saveWorkshopService(item.id, { nameEs: item.nameEs, nameEn: item.nameEn, precioVentaNeto: "100.00", costoNeto: "40.00", active: true });
    await prisma.$transaction((tx) => seedWorkshopServices(tx, orgA.id));
    expect(await prisma.workshopService.count({ where: { organizationId: orgA.id } })).toBe(11);
    expect((await prisma.workshopService.findUniqueOrThrow({ where: { id: item.id } })).precioVentaNeto?.toFixed(2)).toBe("100.00");
    const other = await prisma.workshopService.create({ data: { organizationId: orgB.id, nameEs: "Servicio ajeno", nameEn: "Other service" } });
    await expect(saveWorkshopService(other.id, { nameEs: "Cambio", nameEn: "Change", active: true })).rejects.toThrow(/no disponible/i);
    auth.mockResolvedValue({ user: { id: ownerId, role: "AGENT", organizationId: orgA.id } });
    try { await expect(saveWorkshopService(item.id, { nameEs: "Cambio", nameEn: "Change", active: true })).rejects.toThrow(/No autorizado/i); }
    finally { auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } }); }
  });

  it("keeps the Wolf landing closed by default and turns a submitted Lead into a CRM customer and vehicle", async () => {
    expect(await getWolfLandingOrg()).toBeNull();
    expect((await submitPublicInquiry(new Request("http://localhost/api/workshop/public/inquiries", { method: "POST", body: "{}" }))).status).toBe(403);
    expect((await submitPublicInquiry(new Request("http://localhost/api/workshop/public/inquiries", { method: "POST", headers: { origin: "http://localhost" }, body: "{}" }))).status).toBe(404);
    process.env.WORKSHOP_WOLF_SITE_ORIGIN = "https://wolftest.example";
    try {
      expect((await submitPublicInquiry(new Request("http://localhost/api/workshop/public/inquiries", { method: "POST", headers: { origin: "https://otro.example" }, body: "{}" }))).status).toBe(403);
      expect((await submitPublicInquiry(new Request("http://localhost/api/workshop/public/inquiries", { method: "POST", headers: { origin: "https://wolftest.example" }, body: "{}" }))).status).toBe(404);
    } finally { delete process.env.WORKSHOP_WOLF_SITE_ORIGIN; }
    const input = wolfInquirySchema.parse({ requestKey: crypto.randomUUID(), name: "María Wolf", phone: "8711079912", marca: "Nissan", modelo: "Versa", anio: 2021, placas: " WOLF 9 ", kilometraje: 42000, servicioFalla: "Revisar frenos", consent: true, maintenanceConsent: true });
    const first = await submitWolfInquiry(orgA.id, input);
    const retry = await submitWolfInquiry(orgA.id, input);
    expect("id" in first && "id" in retry && retry.id === first.id).toBe(true);
    expect(await prisma.lead.count({ where: { organizationId: orgA.id, externalId: `workshop:${input.requestKey}` } })).toBe(1);
    if (!("id" in first)) throw new Error("request missing");
    const request = await prisma.workshopLeadRequest.findUniqueOrThrow({ where: { id: first.id }, include: { lead: true } });
    expect(request.placas).toBe("WOLF9");
    expect(request.lead.source).toBe("landing");
    expect((request.lead.metadata as { consent?: { maintenanceReminders?: boolean } })?.consent?.maintenanceReminders).toBe(true);
    auth.mockResolvedValue({ user: { id: ownerId, role: "VIEWER", organizationId: orgA.id } });
    await expect(markWorkshopRequestViewed(request.id)).rejects.toThrow(/autorizado/i);
    auth.mockResolvedValue({ user: { id: ownerId, role: "AGENT", organizationId: orgA.id } });
    expect((await markWorkshopRequestViewed(request.id)).updated).toBe(true);
    auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgB.id } });
    expect((await markWorkshopRequestViewed(request.id)).updated).toBe(false);
    await expect(createWorkshopVehicleFromRequest(request.id, "3N1CN7AP9ML812345", true)).rejects.toThrow();
    auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } });
    expect((await markWorkshopRequestViewed(request.id)).updated).toBe(false);
    expect((await prisma.workshopLeadRequest.findUniqueOrThrow({ where: { id: request.id } })).viewedById).toBe(ownerId);
    await expect(createWorkshopVehicleFromRequest(request.id, "3N1CN7AP9ML812345", false)).rejects.toThrow(/identidad/i);
    const vehicle = await createWorkshopVehicleFromRequest(request.id, "3N1CN7AP9ML812345", true);
    expect(vehicle.servicioFalla).toBe("Revisar frenos");
    const saved = await prisma.workshopVehicle.findUniqueOrThrow({ where: { id: vehicle.id }, include: { customer: true } });
    expect(saved.kilometrajeActual).toBe(42000);
    expect(saved.customer.leadId).toBe(request.leadId);
    expect(saved.customer.consentAccepted).toBe(false);
    expect((await prisma.workshopLeadRequest.findUniqueOrThrow({ where: { id: request.id } })).vehicleId).toBe(vehicle.id);
    await submitWolfInquiry(orgA.id, { ...input, requestKey: crypto.randomUUID(), phone: "8110000001" });
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customerA.id } })).leadId).toBeNull();
    const publicInput = { ...input, requestKey: crypto.randomUUID(), phone: "8110000002", maintenanceConsent: false };
    const optionalInput = { ...publicInput, requestKey: crypto.randomUUID(), phone: "8110000003", placas: null, kilometraje: null };
    process.env.WORKSHOP_WOLF_SITE_ORIGIN = "https://wolftest.example";
    process.env.WORKSHOP_WOLF_LANDING_ENABLED = "true";
    process.env.WORKSHOP_WOLF_ORG_ID = orgA.id;
    try {
      const requestFromSite = () => new Request("http://localhost/api/workshop/public/inquiries", { method: "POST", headers: { origin: "https://wolftest.example", "content-type": "application/json" }, body: JSON.stringify(publicInput) });
      expect((await submitPublicInquiry(requestFromSite())).status).toBe(200);
      expect((await submitPublicInquiry(requestFromSite())).status).toBe(200);
      expect(await prisma.lead.count({ where: { organizationId: orgA.id, externalId: `workshop:${publicInput.requestKey}` } })).toBe(1);
      const optionalResponse = await submitPublicInquiry(new Request("http://localhost/api/workshop/public/inquiries", { method: "POST", headers: { origin: "https://wolftest.example", "content-type": "application/json" }, body: JSON.stringify(optionalInput) }));
      expect(optionalResponse.status).toBe(200);
      const optionalRequest = await prisma.workshopLeadRequest.findUniqueOrThrow({ where: { organizationId_requestKey: { organizationId: orgA.id, requestKey: optionalInput.requestKey } } });
      expect(optionalRequest.placas).toBeNull();
      expect(optionalRequest.kilometraje).toBeNull();
      const completed = await createWorkshopVehicleFromRequest(optionalRequest.id, "", true);
      const completedVehicle = await prisma.workshopVehicle.findUniqueOrThrow({ where: { id: completed.id } });
      expect(completedVehicle.placas).toBeNull();
      expect(completedVehicle.vin).toBeNull();
      expect(completedVehicle.kilometrajeActual).toBeNull();
      const linkedInput = { vehicleId: completed.id, requestId: optionalRequest.id, servicioTitulo: "Revisar frenos", items: [{ tipo: "SERVICIO" as const, concepto: "Revisión", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "100.00" }] };
      const linked = await createWorkshopQuote(linkedInput);
      expect((await createWorkshopQuote(linkedInput)).id).toBe(linked.id);
      expect((await prisma.workshopQuote.findUniqueOrThrow({ where: { id: linked.id } })).estado).toBe("BORRADOR");
      expect(await prisma.workshopQuote.count({ where: { requestId: optionalRequest.id } })).toBe(1);
      await expect(issueWorkshopQuote(linked.id)).rejects.toThrow(/Completa nombre/i);
      expect((await discardWorkshopRequest(optionalRequest.id)).updated).toBe(false);
      auth.mockResolvedValue({ user: { id: ownerId, role: "AGENT", organizationId: orgA.id } });
      await expect(discardWorkshopRequest(request.id)).rejects.toThrow(/No autorizado/i);
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgB.id } });
      expect((await discardWorkshopRequest(request.id)).updated).toBe(false);
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } });
      expect((await discardWorkshopRequest(request.id)).updated).toBe(true);
      expect((await discardWorkshopRequest(request.id)).updated).toBe(false);
      expect((await submitPublicInquiry(new Request("http://localhost/api/workshop/public/inquiries", { method: "POST", headers: { origin: "https://otro.example" }, body: JSON.stringify(publicInput) }))).status).toBe(403);
    } finally {
      delete process.env.WORKSHOP_WOLF_SITE_ORIGIN;
      delete process.env.WORKSHOP_WOLF_LANDING_ENABLED;
      delete process.env.WORKSHOP_WOLF_ORG_ID;
    }
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

  it("saves workshop defaults and next service only for the session organization", async () => {
    const vehicle = await prisma.workshopVehicle.findFirstOrThrow({ where: { organizationId: orgA.id, placas: "WOLF1" } });
    await saveWorkshopSettings({ vigenciaDias: 20, garantiaDias: 100, garantiaKm: 6000 });
    expect((await prisma.workshopSettings.findUniqueOrThrow({ where: { organizationId: orgA.id } })).vigenciaDias).toBe(20);
    await saveWorkshopSettings({ vigenciaDias: 15, garantiaDias: 90, garantiaKm: 5000 });
    await setWorkshopNextService(vehicle.id, 35000, "2027-02-15");
    expect((await prisma.workshopVehicle.findUniqueOrThrow({ where: { id: vehicle.id } })).proximoServicioFecha?.toISOString().slice(0, 10)).toBe("2027-02-15");
    await expect(setWorkshopNextService(vehicle.id, 35000, "2027-02-30")).rejects.toThrow(/Fecha/i);
    auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgB.id } });
    await expect(setWorkshopNextService(vehicle.id, 40000, null)).rejects.toThrow(/organización/i);
    auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } });
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
    process.env.WORKSHOP_WOLF_ORG_ID = orgA.id;
    try {
      const branded = await downloadQuotePdf(new Request("http://localhost/api/workshop/quotes/x/pdf"), { params: Promise.resolve({ id: quoteId }) });
      expect(branded.status).toBe(200);
      expect(branded.headers.get("content-disposition")).toContain("cotizacion-cambio-de-aceite-honda-accord-2020-tallerwolf.pdf");
      expect((await PDFDocument.load(await branded.arrayBuffer())).getTitle()).toBe("cotizacion-cambio-de-aceite-honda-accord-2020-tallerwolf");
    } finally { delete process.env.WORKSHOP_WOLF_ORG_ID; }
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
    const pdf = await downloadOrderPdf(new Request("http://localhost/order"), { params: Promise.resolve({ id: order.id }) });
    expect(pdf.status).toBe(200);
    expect(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString()).toBe("%PDF");
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
    await setWorkshopInvoiceRequested(order.id, true);
    expect((await prisma.workshopWorkOrder.findUniqueOrThrow({ where: { id: order.id } })).facturaSolicitada).toBe(true);
    await expect(advanceWorkshopOrder(order.id, "DIAGNOSTICO")).rejects.toThrow(/fotos/i);
    await saveWorkshopReception(order.id, { kilometrajeIngreso: 30000, nivelCombustible: "medio", fallaReportada: "Cambio de filtro", danosPrevios: "ninguno", testigos: "ninguno", pertenencias: "ninguna" });
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "white" } }).png().toBuffer();
    async function addPhoto(phase: string) {
      const form = new FormData(); form.set("phase", phase); form.set("file", new File([png], "photo.png", { type: "image/png" }));
      return uploadPhoto(new Request(`http://localhost/api/workshop/orders/${order.id}/photos`, { method: "POST", headers: { origin: "http://localhost" }, body: form }), { params: Promise.resolve({ id: order.id }) });
    }
    const oversized = new Request(`http://localhost/api/workshop/orders/${order.id}/photos`, { method: "POST", headers: { origin: "http://localhost", "content-type": "multipart/form-data; boundary=test" }, body: new Uint8Array(5 * 1024 * 1024 + 16 * 1024 + 1) });
    expect((await uploadPhoto(oversized, { params: Promise.resolve({ id: order.id }) })).status).toBe(400);
    expect((await addPhoto("RECEPCION")).status).toBe(201);
    await advanceWorkshopOrder(order.id, "DIAGNOSTICO");
    await saveWorkshopReception(order.id, { kilometrajeIngreso: 30000, nivelCombustible: "medio", fallaReportada: "Cambio de filtro", diagnostico: "Filtro requiere reemplazo", danosPrevios: "ninguno", testigos: "ninguno", pertenencias: "ninguna" });
    await expect(advanceWorkshopOrder(order.id, "EN_REPARACION")).rejects.toThrow(/existencias/i);
    await createWorkshopPurchase({ requestKey: crypto.randomUUID(), proveedor: "Proveedor local", paid: false, lines: [{ partId: part.id, cantidad: "1", costoUnitarioNeto: "50.00" }] });
    await advanceWorkshopOrder(order.id, "EN_REPARACION");
    expect(await getWorkshopPartStock(part.id)).toBe("0");
    await expect(advanceWorkshopOrder(order.id, "EN_REPARACION")).rejects.toThrow(/Transición/i);
    const extraPart = { requestKey: crypto.randomUUID(), tipo: "REFACCION" as const, partId: part.id, concepto: "Filtro adicional", cantidad: "1", unidad: "pza", precioUnitarioNeto: "10.00", costoUnitarioNeto: "5.00", autorizadaVia: "WhatsApp" };
    await expect(addWorkshopAuthorizedLine(order.id, extraPart)).rejects.toThrow(/existencias/i);
    const extra = { requestKey: crypto.randomUUID(), tipo: "SERVICIO" as const, concepto: "Trabajo adicional", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "10.00", costoUnitarioNeto: "5.00", autorizadaVia: "WhatsApp" };
    const [added, retried] = await Promise.all([addWorkshopAuthorizedLine(order.id, extra), addWorkshopAuthorizedLine(order.id, extra)]);
    expect(retried.id).toBe(added.id);
    expect(await prisma.workshopOrderItem.count({ where: { organizationId: orgA.id, requestKey: extra.requestKey } })).toBe(1);
    await expect(addWorkshopAuthorizedLine(order.id, { ...extra, concepto: "Otro trabajo" })).rejects.toThrow(/clave de solicitud/i);
    expect((await addPhoto("PROCESO")).status).toBe(201);
    await advanceWorkshopOrder(order.id, "LISTA_PARA_ENTREGA");
    expect((await addPhoto("ENTREGA")).status).toBe(201);
    await expect(deliverWorkshopOrder(order.id, 30001, true)).rejects.toThrow(/saldo/i);
    const paymentKey = crypto.randomUUID();
    const payment = await recordWorkshopOrderPayment(order.id, { requestKey: paymentKey, monto: "400.00", metodo: "EFECTIVO" });
    expect((await recordWorkshopOrderPayment(order.id, { requestKey: paymentKey, monto: "400.00", metodo: "EFECTIVO" })).id).toBe(payment.id);
    expect((await prisma.workshopWorkOrder.findUniqueOrThrow({ where: { id: order.id } })).saldo.toFixed(2)).toBe("75.60");
    await authorizeWorkshopCredit(order.id, "Pago restante en siete días");
    await deliverWorkshopOrder(order.id, 30001, true);
    expect((await prisma.workshopWorkOrder.findUniqueOrThrow({ where: { id: order.id } })).estado).toBe("ENTREGADA");
    await expect(setWorkshopInvoiceRequested(order.id, false)).rejects.toThrow(/no disponible/i);
    await recordWorkshopOrderPayment(order.id, { requestKey: crypto.randomUUID(), monto: "75.60", metodo: "TARJETA" });
    expect((await prisma.workshopWorkOrder.findUniqueOrThrow({ where: { id: order.id } })).saldo.toFixed(2)).toBe("0.00");
    await expect(saveWorkshopReception(order.id, { kilometrajeIngreso: 30001, nivelCombustible: "medio", fallaReportada: "Editar", danosPrevios: "", testigos: "", pertenencias: "" })).rejects.toThrow(/no disponible/i);
    const photo = await prisma.workshopPhoto.findFirstOrThrow({ where: { organizationId: orgA.id, workOrderId: order.id } });
    const response = await readPhoto(new Request("http://localhost/photo"), { params: Promise.resolve({ id: photo.id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("lets mechanics open customer quote PDFs without granting financial actions or cross-org access", async () => {
    const quote = await prisma.workshopQuote.findUniqueOrThrow({ where: { id: quoteId } });
    const order = await prisma.workshopWorkOrder.findUniqueOrThrow({ where: { quoteId } });
    const photo = await prisma.workshopPhoto.findFirstOrThrow({ where: { organizationId: orgA.id } });
    try {
      auth.mockResolvedValue({ user: { id: ownerId, role: "AGENT", organizationId: orgA.id } });
      expect((await downloadQuotePdf(new Request("http://localhost/quote"), { params: Promise.resolve({ id: quote.id }) })).status).toBe(200);
      expect((await downloadQuotePdf(new Request("http://localhost/quote?print=1"), { params: Promise.resolve({ id: quote.id }) })).headers.get("content-disposition")).toMatch(/^inline;/);
      expect((await downloadOrderPdf(new Request("http://localhost/order"), { params: Promise.resolve({ id: order.id }) })).status).toBe(403);
      await expect(issueWorkshopQuote(quote.id)).rejects.toThrow(/No autorizado/i);
      await expect(setWorkshopInvoiceRequested(order.id, false)).rejects.toThrow(/No autorizado/i);
      await expect(addWorkshopAuthorizedLine(order.id, { requestKey: crypto.randomUUID(), tipo: "SERVICIO", concepto: "Cambio extra", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "1.00", autorizadaVia: "WhatsApp" })).rejects.toThrow(/No autorizado/i);
      auth.mockResolvedValue({ user: { id: ownerId, role: "VIEWER", organizationId: orgA.id } });
      expect((await downloadQuotePdf(new Request("http://localhost/quote"), { params: Promise.resolve({ id: quote.id }) })).status).toBe(403);
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgB.id } });
      expect((await downloadQuotePdf(new Request("http://localhost/quote"), { params: Promise.resolve({ id: quote.id }) })).status).toBe(404);
      expect((await downloadOrderPdf(new Request("http://localhost/order"), { params: Promise.resolve({ id: order.id }) })).status).toBe(404);
      expect((await readPhoto(new Request("http://localhost/photo"), { params: Promise.resolve({ id: photo.id }) })).status).toBe(404);
      await expect(addWorkshopAuthorizedLine(order.id, { requestKey: crypto.randomUUID(), tipo: "SERVICIO", concepto: "Cambio extra", cantidad: "1", unidad: "serv.", precioUnitarioNeto: "1.00", autorizadaVia: "WhatsApp" })).rejects.toThrow(/estado/i);
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } });
      expect((await readPhoto(new Request("http://localhost/photo"), { params: Promise.resolve({ id: "other-org-photo" }) })).status).toBe(404);
    } finally {
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } });
    }
  });

  it("keeps stock, purchases, payments and order updates inside the tenant and owner role", async () => {
    const part = await prisma.workshopPart.findFirstOrThrow({ where: { organizationId: orgA.id } });
    const order = await prisma.workshopWorkOrder.findFirstOrThrow({ where: { organizationId: orgA.id } });
    const purchases = await prisma.workshopPurchase.count({ where: { organizationId: orgA.id } });
    const cash = await prisma.workshopCashMovement.count({ where: { organizationId: orgA.id } });
    const purchaseInput = { requestKey: crypto.randomUUID(), proveedor: "Proveedor externo", paid: true, method: "EFECTIVO" as const, lines: [{ partId: part.id, cantidad: "1", costoUnitarioNeto: "10.00" }] };
    try {
      auth.mockResolvedValue({ user: { id: ownerId, role: "AGENT", organizationId: orgA.id } });
      await expect(createWorkshopPurchase(purchaseInput)).rejects.toThrow(/No autorizado/i);
      await expect(recordWorkshopOrderPayment(order.id, { requestKey: crypto.randomUUID(), monto: "1.00", metodo: "EFECTIVO" })).rejects.toThrow(/No autorizado/i);
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgB.id } });
      await expect(getWorkshopPartStock(part.id)).rejects.toThrow(/no encontrada/i);
      await expect(createWorkshopPurchase(purchaseInput)).rejects.toThrow(/organización/i);
      await expect(recordWorkshopOrderPayment(order.id, { requestKey: crypto.randomUUID(), monto: "1.00", metodo: "EFECTIVO" })).rejects.toThrow(/no disponible/i);
      await expect(saveWorkshopReception(order.id, { kilometrajeIngreso: 30001, nivelCombustible: "medio", fallaReportada: "Editar", danosPrevios: "", testigos: "", pertenencias: "" })).rejects.toThrow(/no disponible/i);
      expect(await prisma.workshopPurchase.count({ where: { organizationId: orgA.id } })).toBe(purchases);
      expect(await prisma.workshopCashMovement.count({ where: { organizationId: orgA.id } })).toBe(cash);
    } finally {
      auth.mockResolvedValue({ user: { id: ownerId, role: "OWNER", organizationId: orgA.id } });
    }
  });
});
