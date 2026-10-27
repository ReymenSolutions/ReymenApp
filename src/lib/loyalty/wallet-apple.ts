// Apple Wallet: pase .pkpass firmado + servicio web de actualizaciones + aviso
// por APNs cuando cambia el progreso.
//
// Variables (ver .env.example y docs/wallet.md):
//   APPLE_WALLET_PASS_TYPE_ID       pass.mx.reymen.lealtad
//   APPLE_WALLET_TEAM_ID            ABCDE12345
//   APPLE_WALLET_CERT_P12_BASE64    certificado del Pass Type ID (.p12) en base64
//   APPLE_WALLET_CERT_PASSWORD      contraseña del .p12
//   APPLE_WALLET_WWDR_PEM_BASE64    certificado intermedio WWDR G4 de Apple (PEM) en base64
// Sin alguna de ellas, Apple Wallet queda desactivado y la tarjeta web sigue igual.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import http2 from "node:http2";
import forge from "node-forge";
import { getAppUrl } from "@/lib/app-url";
import { zipStore } from "./zip";
import { renderIconPng } from "./wallet-images";
import type { WalletPassData } from "./wallet-data";

export interface AppleWalletConfig {
  passTypeId: string;
  teamId: string;
  certPem: string;
  keyPem: string;
  wwdrPem: string;
}

let cached: { raw: string; config: AppleWalletConfig | null } | null = null;

function decodeMaybeBase64(v: string): string {
  const t = v.trim();
  return t.startsWith("-----BEGIN") ? t : Buffer.from(t, "base64").toString("utf8");
}

/** Configuración de Apple Wallet, o null si falta algo (o el .p12 no abre). */
export function appleWalletConfig(): AppleWalletConfig | null {
  const e = process.env;
  const raw = [e.APPLE_WALLET_PASS_TYPE_ID, e.APPLE_WALLET_TEAM_ID, e.APPLE_WALLET_CERT_P12_BASE64, e.APPLE_WALLET_CERT_PASSWORD, e.APPLE_WALLET_WWDR_PEM_BASE64].join("|");
  if (cached?.raw === raw) return cached.config;
  let config: AppleWalletConfig | null = null;
  if (e.APPLE_WALLET_PASS_TYPE_ID && e.APPLE_WALLET_TEAM_ID && e.APPLE_WALLET_CERT_P12_BASE64 && e.APPLE_WALLET_WWDR_PEM_BASE64) {
    try {
      const p12 = forge.pkcs12.pkcs12FromAsn1(
        forge.asn1.fromDer(forge.util.decode64(e.APPLE_WALLET_CERT_P12_BASE64.trim())),
        e.APPLE_WALLET_CERT_PASSWORD ?? ""
      );
      const certBag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]?.[0];
      const keyBag =
        p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag]?.[0] ??
        p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag]?.[0];
      if (certBag?.cert && keyBag?.key) {
        config = {
          passTypeId: e.APPLE_WALLET_PASS_TYPE_ID.trim(),
          teamId: e.APPLE_WALLET_TEAM_ID.trim(),
          certPem: forge.pki.certificateToPem(certBag.cert),
          keyPem: forge.pki.privateKeyToPem(keyBag.key),
          wwdrPem: decodeMaybeBase64(e.APPLE_WALLET_WWDR_PEM_BASE64),
        };
      } else {
        console.error("[wallet-apple] El .p12 no trae certificado y llave.");
      }
    } catch (err) {
      console.error("[wallet-apple] No se pudo abrir el certificado .p12:", err instanceof Error ? err.message : err);
    }
  }
  cached = { raw, config };
  return config;
}

function walletSecret(): string {
  return process.env.WALLET_AUTH_SECRET || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "dev-wallet-secret";
}

/** Token que Apple manda en cada llamada del servicio web para ese pase. Sale del id, sin guardarlo. */
export function appleAuthToken(serialNumber: string): string {
  return createHmac("sha256", walletSecret()).update(`apple-wallet:${serialNumber}`).digest("hex").slice(0, 40);
}

export function checkAppleAuth(serialNumber: string, header: string | null): boolean {
  const got = header?.replace(/^ApplePass\s+/i, "").trim() ?? "";
  const want = appleAuthToken(serialNumber);
  return got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
}

const rgb = (hex: string) => {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

/** El pass.json (puro, se puede probar sin certificados). */
export function buildApplePassJson(data: WalletPassData, cfg: Pick<AppleWalletConfig, "passTypeId" | "teamId">) {
  const { card, style } = data;
  return {
    formatVersion: 1,
    passTypeIdentifier: cfg.passTypeId,
    teamIdentifier: cfg.teamId,
    serialNumber: data.memberId,
    authenticationToken: appleAuthToken(data.memberId),
    webServiceURL: `${getAppUrl()}/api/wallet/apple`,
    organizationName: data.businessName,
    description: `${data.programName} · ${data.businessName}`,
    logoText: data.businessName,
    backgroundColor: rgb(style.base),
    foregroundColor: rgb(style.text),
    labelColor: rgb(style.accent),
    sharingProhibited: true,
    storeCard: {
      headerFields: [{ key: "visits", label: "VISITAS", value: `${Math.min(data.cycleVisits, data.visitGoal)}/${data.visitGoal}`, changeMessage: "Llevas %@ visitas" }],
      primaryFields: [{ key: "program", label: card.holder ? `Hola, ${card.holder}` : "Programa", value: data.programName }],
      secondaryFields: [
        { key: "reward", label: "RECOMPENSA", value: data.rewardName },
        { key: "available", label: "PARA CANJEAR", value: data.availableRewards, changeMessage: "Tienes %@ recompensa(s) para canjear" },
      ],
      auxiliaryFields: [{ key: "status", label: "", value: card.message, changeMessage: "%@" }],
      backFields: [
        { key: "how", label: "Cómo funciona", value: "Muestra este código en caja en cada visita. Al completar las visitas, tu recompensa aparece aquí." },
        { key: "card", label: "Tu tarjeta en línea", value: data.cardUrl },
        { key: "since", label: "Miembro desde", value: data.memberSince.toISOString().slice(0, 10) },
      ],
    },
    barcodes: [{ format: "PKBarcodeFormatQR", message: data.cardUrl, messageEncoding: "iso-8859-1" }],
  };
}

/** Firma PKCS#7 separada del manifest, con el certificado del pase y el intermedio WWDR. */
function signManifest(manifest: Buffer, cfg: AppleWalletConfig): Buffer {
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(manifest.toString("binary"));
  const cert = forge.pki.certificateFromPem(cfg.certPem);
  p7.addCertificate(cert);
  p7.addCertificate(forge.pki.certificateFromPem(cfg.wwdrPem));
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(cfg.keyPem),
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() as unknown as string },
    ],
  });
  p7.sign({ detached: true });
  return Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), "binary");
}

/** El .pkpass listo para descargar. */
export async function buildPkpass(data: WalletPassData, cfg: AppleWalletConfig): Promise<Buffer> {
  const { style } = data;
  const files: { name: string; data: Buffer }[] = [
    { name: "pass.json", data: Buffer.from(JSON.stringify(buildApplePassJson(data, cfg))) },
    { name: "icon.png", data: await renderIconPng(style.icon, style.accent, style.onAccent, 29) },
    { name: "icon@2x.png", data: await renderIconPng(style.icon, style.accent, style.onAccent, 58) },
    { name: "icon@3x.png", data: await renderIconPng(style.icon, style.accent, style.onAccent, 87) },
    { name: "logo.png", data: await renderIconPng(style.icon, style.accent, style.onAccent, 50, true) },
    { name: "logo@2x.png", data: await renderIconPng(style.icon, style.accent, style.onAccent, 100, true) },
  ];
  const manifest: Record<string, string> = {};
  for (const f of files) manifest[f.name] = createHash("sha1").update(f.data).digest("hex");
  const manifestBuf = Buffer.from(JSON.stringify(manifest));
  files.push({ name: "manifest.json", data: manifestBuf }, { name: "signature", data: signManifest(manifestBuf, cfg) });
  return zipStore(files);
}

/**
 * Avisa a los iPhone que tienen el pase que hay una versión nueva (APNs, push
 * vacío con el Pass Type ID como tema). Devuelve los tokens que Apple dio por
 * inválidos (410) para borrarlos.
 */
export async function pushAppleUpdates(pushTokens: string[], cfg: AppleWalletConfig): Promise<string[]> {
  if (pushTokens.length === 0) return [];
  const gone: string[] = [];
  const client = http2.connect("https://api.push.apple.com", { cert: cfg.certPem, key: cfg.keyPem });
  client.on("error", (err) => console.error("[wallet-apple] APNs:", err.message));
  try {
    await Promise.all(
      pushTokens.map(
        (token) =>
          new Promise<void>((resolve) => {
            const req = client.request({ ":method": "POST", ":path": `/3/device/${token}`, "apns-topic": cfg.passTypeId, "content-type": "application/json" });
            req.setTimeout(10_000, () => req.close());
            req.on("response", (headers) => {
              const status = Number(headers[":status"]);
              if (status === 410) gone.push(token);
              else if (status !== 200) console.error(`[wallet-apple] APNs respondió ${status} para un dispositivo.`);
            });
            req.on("close", () => resolve());
            req.on("error", () => resolve());
            req.end("{}");
          })
      )
    );
  } finally {
    client.close();
  }
  return gone;
}
