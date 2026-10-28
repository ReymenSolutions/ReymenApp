// @vitest-environment node
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { createHash, createPublicKey, createVerify, generateKeyPairSync } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import forge from "node-forge";
import { zipStore } from "./zip";
import { appleAuthToken, appleWalletConfig, buildApplePassJson, buildPkpass, checkAppleAuth } from "./wallet-apple";
import { buildGoogleClass, buildGoogleObject, googleSaveUrl, googleWalletConfig, signJwt } from "./wallet-google";
import { getWalletAvailability } from "./wallet";
import { cardStyle } from "./card-style";
import { buildWalletCard } from "./wallet";
import type { WalletPassData } from "./wallet-data";

const data: WalletPassData = {
  memberId: "cmember123",
  programId: "cprogram456",
  businessName: "Taller Automotriz Wolf",
  logoUrl: null,
  programName: "Club Wolf",
  rewardName: "Bebida gratis",
  cycleVisits: 3,
  visitGoal: 10,
  availableRewards: 0,
  memberSince: new Date("2026-10-26T12:00:00Z"),
  cardUrl: "https://app.reymen.mx/lealtad/taller-wolf/tarjeta/ABCDEFGHIJKLMNOPQRSTUV",
  style: cardStyle({ cardColor: "#0B1E4F", cardAccent: "#F97316", cardIcon: "car" }),
  updatedAt: new Date("2026-10-27T10:00:00Z"),
  card: buildWalletCard({
    businessName: "Taller Automotriz Wolf",
    programName: "Club Wolf",
    memberFirstName: "Emiliano",
    cycleVisits: 3,
    visitGoal: 10,
    rewardName: "Bebida gratis",
    availableRewards: 0,
    cardUrl: "https://app.reymen.mx/lealtad/taller-wolf/tarjeta/ABCDEFGHIJKLMNOPQRSTUV",
  }),
};

const ENV_KEYS = ["APPLE_WALLET_PASS_TYPE_ID", "APPLE_WALLET_TEAM_ID", "APPLE_WALLET_CERT_P12_BASE64", "APPLE_WALLET_CERT_PASSWORD", "APPLE_WALLET_WWDR_PEM_BASE64", "GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_JSON"];
const saved: Record<string, string | undefined> = {};
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

/** Certificado de prueba autofirmado (hace las veces del Pass Type ID y del WWDR). */
function selfSigned(cn: string) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 86_400_000 * 365);
  cert.setSubject([{ name: "commonName", value: cn }]);
  cert.setIssuer([{ name: "commonName", value: cn }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { cert, key: keys.privateKey };
}

let p12Base64 = "";
let wwdrBase64 = "";
let signerPem = "";
beforeAll(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  const signer = selfSigned("Pass Type ID: pass.mx.reymen.test");
  signerPem = forge.pki.certificateToPem(signer.cert);
  const p12 = forge.pkcs12.toPkcs12Asn1(signer.key, [signer.cert], "secreto", { algorithm: "3des" });
  p12Base64 = forge.util.encode64(forge.asn1.toDer(p12).getBytes());
  wwdrBase64 = Buffer.from(forge.pki.certificateToPem(selfSigned("WWDR test").cert)).toString("base64");
});

function setApple() {
  process.env.APPLE_WALLET_PASS_TYPE_ID = "pass.mx.reymen.test";
  process.env.APPLE_WALLET_TEAM_ID = "TEAM123456";
  process.env.APPLE_WALLET_CERT_P12_BASE64 = p12Base64;
  process.env.APPLE_WALLET_CERT_PASSWORD = "secreto";
  process.env.APPLE_WALLET_WWDR_PEM_BASE64 = wwdrBase64;
}

describe("zipStore", () => {
  it("writes a zip that unzip accepts with the same contents", () => {
    const dir = mkdtempSync(join(tmpdir(), "zip-"));
    const file = join(dir, "t.zip");
    writeFileSync(file, zipStore([{ name: "a.json", data: Buffer.from('{"x":1}') }, { name: "b.bin", data: Buffer.from([0, 1, 2, 255]) }]));
    const listing = execFileSync("unzip", ["-l", file]).toString();
    expect(listing).toContain("a.json");
    execFileSync("unzip", ["-t", file]);
    expect(execFileSync("unzip", ["-p", file, "a.json"]).toString()).toBe('{"x":1}');
  });
});

describe("Apple Wallet", () => {
  it("stays off until every credential is set", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(getWalletAvailability()).toEqual({ apple: false, google: false });
    setApple();
    expect(getWalletAvailability().apple).toBe(true);
    process.env.APPLE_WALLET_CERT_PASSWORD = "otra";
    expect(appleWalletConfig()).toBeNull();
  });

  it("builds a store card with progress, reward and the card QR", () => {
    const pass = buildApplePassJson(data, { passTypeId: "pass.mx.reymen.test", teamId: "TEAM123456" });
    expect(pass).toMatchObject({ formatVersion: 1, serialNumber: "cmember123", organizationName: "Taller Automotriz Wolf", sharingProhibited: true });
    expect(pass.storeCard.headerFields[0]).toMatchObject({ label: "VISITAS", value: "3/10" });
    expect(pass.barcodes[0]).toMatchObject({ format: "PKBarcodeFormatQR", message: data.cardUrl });
    expect(pass.backgroundColor).toBe("rgb(11, 30, 79)");
    expect(pass.webServiceURL).toMatch(/\/api\/wallet\/apple$/);
  });

  it("CRITICAL: the auth token only opens its own pass", () => {
    const t = appleAuthToken("cmember123");
    expect(t.length).toBeGreaterThanOrEqual(16);
    expect(checkAppleAuth("cmember123", `ApplePass ${t}`)).toBe(true);
    expect(checkAppleAuth("otro-miembro", `ApplePass ${t}`)).toBe(false);
    expect(checkAppleAuth("cmember123", null)).toBe(false);
  });

  it("signs a .pkpass whose manifest matches its files and whose signature verifies", async () => {
    setApple();
    const cfg = appleWalletConfig()!;
    const pkpass = await buildPkpass(data, cfg);
    const dir = mkdtempSync(join(tmpdir(), "pkpass-"));
    const file = join(dir, "p.pkpass");
    writeFileSync(file, pkpass);
    execFileSync("unzip", ["-q", file, "-d", join(dir, "x")]);
    const manifest = JSON.parse(readFileSync(join(dir, "x", "manifest.json"), "utf8")) as Record<string, string>;
    expect(Object.keys(manifest).sort()).toEqual(["icon.png", "icon@2x.png", "icon@3x.png", "logo.png", "logo@2x.png", "pass.json"]);
    for (const [name, sha] of Object.entries(manifest)) expect(createHash("sha1").update(readFileSync(join(dir, "x", name))).digest("hex")).toBe(sha);
    const png = readFileSync(join(dir, "x", "icon@2x.png"));
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    // La firma PKCS#7 separada se verifica contra el manifest con openssl (sin validar la cadena: el certificado es de prueba).
    writeFileSync(join(dir, "signer.pem"), signerPem);
    execFileSync("openssl", ["smime", "-verify", "-binary", "-inform", "DER", "-in", join(dir, "x", "signature"), "-content", join(dir, "x", "manifest.json"), "-noverify", "-out", "/dev/null"], { stdio: "pipe" });
  });
});

describe("Google Wallet", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });

  function setGoogle() {
    process.env.GOOGLE_WALLET_ISSUER_ID = "3388000000012345678";
    process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON = Buffer.from(JSON.stringify({ client_email: "wallet@reymen.iam.gserviceaccount.com", private_key: privateKey })).toString("base64");
  }

  it("reads the service account as JSON or base64 and turns on", () => {
    for (const k of ENV_KEYS) delete process.env[k];
    expect(googleWalletConfig()).toBeNull();
    setGoogle();
    expect(googleWalletConfig()).toMatchObject({ issuerId: "3388000000012345678", clientEmail: "wallet@reymen.iam.gserviceaccount.com" });
    expect(getWalletAvailability().google).toBe(true);
  });

  it("builds the class per program and the object per member with progress and QR", () => {
    setGoogle();
    const cfg = googleWalletConfig()!;
    const cls = buildGoogleClass(data, cfg);
    expect(cls).toMatchObject({ id: "3388000000012345678.reymen_cprogram456", issuerName: "Taller Automotriz Wolf", programName: "Club Wolf", hexBackgroundColor: "#0B1E4F" });
    expect(cls.programLogo.sourceUri.uri).toMatch(/\/api\/wallet\/logo\/cprogram456$/);
    const obj = buildGoogleObject(data, cfg);
    expect(obj).toMatchObject({ id: "3388000000012345678.member_cmember123", classId: cls.id, state: "ACTIVE" });
    expect(obj.loyaltyPoints.balance).toEqual({ string: "3 / 10" });
    expect(obj.barcode).toMatchObject({ type: "QR_CODE", value: data.cardUrl });
  });

  it("signs the save link with the service account key", () => {
    setGoogle();
    const cfg = googleWalletConfig()!;
    const url = googleSaveUrl(data, cfg);
    expect(url.startsWith("https://pay.google.com/gp/v/save/")).toBe(true);
    const jwt = url.split("/").pop()!;
    const [h, b, sig] = jwt.split(".");
    const ok = createVerify("RSA-SHA256").update(`${h}.${b}`).verify(createPublicKey(publicKey), Buffer.from(sig, "base64url"));
    expect(ok).toBe(true);
    const claims = JSON.parse(Buffer.from(b, "base64url").toString());
    expect(claims).toMatchObject({ aud: "google", typ: "savetowallet", iss: "wallet@reymen.iam.gserviceaccount.com" });
    expect(claims.payload.loyaltyObjects[0]).toEqual({ id: "3388000000012345678.member_cmember123", classId: "3388000000012345678.reymen_cprogram456" });
    expect(signJwt({ a: 1 }, privateKey).split(".")).toHaveLength(3);
  });
});
