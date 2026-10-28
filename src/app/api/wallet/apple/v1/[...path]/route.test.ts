// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import forge from "node-forge";
import { prisma } from "@/lib/prisma";
import { createTestOrg, createTestUser, cleanupOrg } from "@/test/helpers";
import { enrollMember, saveProgram } from "@/lib/loyalty/service";
import { appleAuthToken } from "@/lib/loyalty/wallet-apple";
import { DELETE, GET, POST } from "./route";
import { GET as cardPass } from "../../../../../lealtad/[slug]/tarjeta/[token]/wallet/apple/route";
import { GET as cardGoogle } from "../../../../../lealtad/[slug]/tarjeta/[token]/wallet/google/route";

const PASS = "pass.mx.reymen.test";
const ENV = ["APPLE_WALLET_PASS_TYPE_ID", "APPLE_WALLET_TEAM_ID", "APPLE_WALLET_CERT_P12_BASE64", "APPLE_WALLET_CERT_PASSWORD", "APPLE_WALLET_WWDR_PEM_BASE64", "GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON"];
const saved: Record<string, string | undefined> = {};

function testCert() {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "02";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 30);
  cert.setSubject([{ name: "commonName", value: "test" }]);
  cert.setIssuer([{ name: "commonName", value: "test" }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert, key: keys.privateKey };
}

const params = (path: string[]) => ({ params: Promise.resolve({ path }) });
const req = (url: string, init: RequestInit = {}) => new Request(`https://app.test/api/wallet/apple/v1/${url}`, init);

describe("Apple Wallet: servicio web y descarga del pase", () => {
  let orgId = "";
  let slug = "";
  let token = "";
  let memberId = "";

  beforeAll(async () => {
    for (const k of ENV) saved[k] = process.env[k];
    for (const k of ENV) delete process.env[k];
    const org = await createTestOrg("Wallet Org");
    orgId = org.id;
    slug = org.slug;
    await prisma.organizationModule.create({ data: { organizationId: org.id, module: "LOYALTY", status: "ACTIVE", source: "SUBSCRIBED" } });
    const staff = await createTestUser(org.id, "OWNER", "wallet-owner");
    await saveProgram(org.id, staff.id, { name: "Club Wallet", description: null, status: "ACTIVE", visitGoal: 5, rewardType: "FREE_ITEM", rewardName: "Café gratis", rewardDescription: null, rewardHeadline: null, scope: "ORGANIZATION", branchId: null });
    const r = await enrollMember(slug, { name: "Ana Wallet", whatsapp: "81 5550 7788", postalCode: "64610", email: null, branchId: null, consent: true });
    if (r.status !== "created") throw new Error("enroll");
    token = r.token;
    memberId = (await prisma.loyaltyMember.findUniqueOrThrow({ where: { publicToken: token } })).id;
  });
  afterAll(async () => {
    for (const k of ENV) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    await cleanupOrg(orgId);
  });

  it("without credentials the card routes send the customer back to the card and the service is hidden", async () => {
    for (const res of [
      await cardPass(new Request("https://app.test"), { params: Promise.resolve({ slug, token }) }),
      await cardGoogle(new Request("https://app.test"), { params: Promise.resolve({ slug, token }) }),
    ]) {
      expect(res.status).toBe(303);
      expect(res.headers.get("location")).toMatch(new RegExp(`/lealtad/${slug}/tarjeta/${token}\\?wallet=not_configured$`));
    }
    expect((await GET(req(`passes/${PASS}/${memberId}`), params(["passes", PASS, memberId]))).status).toBe(404);
  });

  it("with credentials: download, register the iPhone, list changes, fetch the pass and unregister", async () => {
    const signer = testCert();
    process.env.APPLE_WALLET_PASS_TYPE_ID = PASS;
    process.env.APPLE_WALLET_TEAM_ID = "TEAM123456";
    process.env.APPLE_WALLET_CERT_P12_BASE64 = forge.util.encode64(forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(signer.key, [signer.cert], "x", { algorithm: "3des" })).getBytes());
    process.env.APPLE_WALLET_CERT_PASSWORD = "x";
    process.env.APPLE_WALLET_WWDR_PEM_BASE64 = Buffer.from(forge.pki.certificateToPem(testCert().cert)).toString("base64");

    const dl = await cardPass(new Request("https://app.test"), { params: Promise.resolve({ slug, token }) });
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-type")).toBe("application/vnd.apple.pkpass");
    expect((await dl.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect((await cardPass(new Request("https://app.test"), { params: Promise.resolve({ slug, token: "AAAAAAAAAAAAAAAAAAAAAA" }) })).status).toBe(404);

    const auth = { authorization: `ApplePass ${appleAuthToken(memberId)}` };
    const path = ["devices", "device-1", "registrations", PASS, memberId];
    // Sin el token correcto no se registra nada.
    expect((await POST(req(path.join("/"), { method: "POST", headers: { authorization: "ApplePass nope" }, body: JSON.stringify({ pushToken: "abc" }) }), params(path))).status).toBe(401);
    expect((await POST(req(path.join("/"), { method: "POST", headers: auth, body: JSON.stringify({ pushToken: "push-abc" }) }), params(path))).status).toBe(201);
    expect((await POST(req(path.join("/"), { method: "POST", headers: auth, body: JSON.stringify({ pushToken: "push-def" }) }), params(path))).status).toBe(200);
    expect(await prisma.loyaltyWalletDevice.findMany({ where: { memberId }, select: { pushToken: true } })).toEqual([{ pushToken: "push-def" }]);

    const list = await GET(req(`devices/device-1/registrations/${PASS}?passesUpdatedSince=0`), params(["devices", "device-1", "registrations", PASS]));
    expect(list.status).toBe(200);
    const body = (await list.json()) as { serialNumbers: string[]; lastUpdated: string };
    expect(body.serialNumbers).toEqual([memberId]);
    const none = await GET(req(`devices/device-1/registrations/${PASS}?passesUpdatedSince=${body.lastUpdated}`), params(["devices", "device-1", "registrations", PASS]));
    expect(none.status).toBe(204);

    const pass = await GET(req(`passes/${PASS}/${memberId}`, { headers: auth }), params(["passes", PASS, memberId]));
    expect(pass.status).toBe(200);
    const notModified = await GET(req(`passes/${PASS}/${memberId}`, { headers: { ...auth, "if-modified-since": pass.headers.get("last-modified")! } }), params(["passes", PASS, memberId]));
    expect(notModified.status).toBe(304);
    expect((await GET(req(`passes/${PASS}/${memberId}`), params(["passes", PASS, memberId]))).status).toBe(401);

    expect((await DELETE(req(path.join("/"), { method: "DELETE", headers: auth }), params(path))).status).toBe(200);
    expect(await prisma.loyaltyWalletDevice.count({ where: { memberId } })).toBe(0);
  });
});
