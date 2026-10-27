// Google Wallet: clase de lealtad por programa (loyaltyClass), un objeto por
// miembro (loyaltyObject) y el enlace "Guardar en Google Wallet" (JWT firmado
// con la cuenta de servicio). Cuando cambia el progreso se actualiza el
// objeto y Google lo refleja solo en el teléfono.
//
// Variables (ver .env.example y docs/wallet.md):
//   GOOGLE_WALLET_ISSUER_ID              id de emisor de la consola de Google Pay & Wallet
//   GOOGLE_WALLET_SERVICE_ACCOUNT_JSON   llave JSON de la cuenta de servicio (texto o base64)
// Sin ellas, Google Wallet queda desactivado y la tarjeta web sigue igual.

import { createSign } from "node:crypto";
import { getAppUrl } from "@/lib/app-url";
import type { WalletPassData } from "./wallet-data";

export interface GoogleWalletConfig {
  issuerId: string;
  clientEmail: string;
  privateKey: string;
}

const API = "https://walletobjects.googleapis.com/walletobjects/v1";
const SCOPE = "https://www.googleapis.com/auth/wallet_object.issuer";

let cachedConfig: { raw: string; config: GoogleWalletConfig | null } | null = null;

export function googleWalletConfig(): GoogleWalletConfig | null {
  const issuer = process.env.GOOGLE_WALLET_ISSUER_ID?.trim();
  const json = process.env.GOOGLE_WALLET_SERVICE_ACCOUNT_JSON?.trim();
  const raw = `${issuer}|${json}`;
  if (cachedConfig?.raw === raw) return cachedConfig.config;
  let config: GoogleWalletConfig | null = null;
  if (issuer && json) {
    try {
      const parsed = JSON.parse(json.startsWith("{") ? json : Buffer.from(json, "base64").toString("utf8")) as { client_email?: string; private_key?: string };
      if (parsed.client_email && parsed.private_key) config = { issuerId: issuer, clientEmail: parsed.client_email, privateKey: parsed.private_key };
      else console.error("[wallet-google] La cuenta de servicio no trae client_email y private_key.");
    } catch {
      console.error("[wallet-google] GOOGLE_WALLET_SERVICE_ACCOUNT_JSON no es un JSON válido.");
    }
  }
  cachedConfig = { raw, config };
  return config;
}

const b64url = (v: Buffer | string) => Buffer.from(v).toString("base64url");

/** JWT RS256 firmado con la llave de la cuenta de servicio. */
export function signJwt(claims: Record<string, unknown>, privateKey: string): string {
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const signature = createSign("RSA-SHA256").update(`${head}.${body}`).sign(privateKey);
  return `${head}.${body}.${b64url(signature)}`;
}

let token: { value: string; expires: number; email: string } | null = null;

async function accessToken(cfg: GoogleWalletConfig): Promise<string> {
  if (token && token.email === cfg.clientEmail && token.expires > Date.now() + 60_000) return token.value;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt({ iss: cfg.clientEmail, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }, cfg.privateKey);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`google_token_${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, expires: Date.now() + data.expires_in * 1000, email: cfg.clientEmail };
  return data.access_token;
}

async function api(cfg: GoogleWalletConfig, method: string, path: string, body?: unknown): Promise<Response> {
  return fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${await accessToken(cfg)}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Los ids de Google son "<emisor>.<sufijo>" con letras, números, punto, guion o guion bajo.
const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");
export const googleClassId = (cfg: GoogleWalletConfig, programId: string) => `${cfg.issuerId}.reymen_${safe(programId)}`;
export const googleObjectId = (cfg: GoogleWalletConfig, memberId: string) => `${cfg.issuerId}.member_${safe(memberId)}`;

/** Logo del programa: el del negocio si tiene uno público; si no, el ícono de la tarjeta. */
export function programLogoUrl(data: WalletPassData): string {
  if (data.logoUrl && /^https:\/\//i.test(data.logoUrl)) return data.logoUrl;
  return `${getAppUrl()}/api/wallet/logo/${encodeURIComponent(data.programId)}`;
}

/** La clase (una por programa): nombre, logo y color. Pura. */
export function buildGoogleClass(data: WalletPassData, cfg: GoogleWalletConfig) {
  return {
    id: googleClassId(cfg, data.programId),
    issuerName: data.businessName.slice(0, 40),
    programName: data.programName.slice(0, 40),
    programLogo: { sourceUri: { uri: programLogoUrl(data) }, contentDescription: { defaultValue: { language: "es-MX", value: data.businessName } } },
    hexBackgroundColor: data.style.base,
    reviewStatus: "UNDER_REVIEW",
    countryCode: "MX",
    multipleDevicesAndHoldersAllowedStatus: "ONE_USER_ALL_DEVICES",
  };
}

/** El objeto (uno por miembro): progreso, recompensas y el QR de su tarjeta. Pura. */
export function buildGoogleObject(data: WalletPassData, cfg: GoogleWalletConfig) {
  const visits = Math.min(data.cycleVisits, data.visitGoal);
  return {
    id: googleObjectId(cfg, data.memberId),
    classId: googleClassId(cfg, data.programId),
    state: "ACTIVE",
    accountName: data.card.holder || "Cliente",
    accountId: data.memberId.slice(-8).toUpperCase(),
    loyaltyPoints: { label: "Visitas", balance: { string: `${visits} / ${data.visitGoal}` } },
    secondaryLoyaltyPoints: { label: "Para canjear", balance: { int: data.availableRewards } },
    barcode: { type: "QR_CODE", value: data.cardUrl, alternateText: "Muéstralo en caja" },
    textModulesData: [
      { id: "status", header: data.availableRewards > 0 ? "¡Recompensa lista!" : "Tu progreso", body: data.card.message },
      { id: "reward", header: "Recompensa", body: data.rewardName },
    ],
    linksModuleData: { uris: [{ id: "card", uri: data.cardUrl, description: "Ver mi tarjeta" }] },
    hexBackgroundColor: data.style.base,
  };
}

/** Crea o actualiza la clase y el objeto en Google. */
export async function upsertGoogleObjects(data: WalletPassData, cfg: GoogleWalletConfig): Promise<void> {
  const cls = buildGoogleClass(data, cfg);
  const clsRes = await api(cfg, "PUT", `/loyaltyClass/${encodeURIComponent(cls.id)}`, cls);
  if (clsRes.status === 404) {
    const created = await api(cfg, "POST", "/loyaltyClass", cls);
    if (!created.ok) throw new Error(`google_class_${created.status}: ${(await created.text()).slice(0, 300)}`);
  } else if (!clsRes.ok) throw new Error(`google_class_${clsRes.status}: ${(await clsRes.text()).slice(0, 300)}`);

  const obj = buildGoogleObject(data, cfg);
  const objRes = await api(cfg, "PUT", `/loyaltyObject/${encodeURIComponent(obj.id)}`, obj);
  if (objRes.status === 404) {
    const created = await api(cfg, "POST", "/loyaltyObject", obj);
    if (!created.ok) throw new Error(`google_object_${created.status}: ${(await created.text()).slice(0, 300)}`);
  } else if (!objRes.ok) throw new Error(`google_object_${objRes.status}: ${(await objRes.text()).slice(0, 300)}`);
}

/** Actualiza el objeto solo si ya existe (si el cliente nunca lo guardó, no hay nada que hacer). */
export async function updateGoogleObject(data: WalletPassData, cfg: GoogleWalletConfig): Promise<"updated" | "absent"> {
  const obj = buildGoogleObject(data, cfg);
  const res = await api(cfg, "PUT", `/loyaltyObject/${encodeURIComponent(obj.id)}`, obj);
  if (res.status === 404) return "absent";
  if (!res.ok) throw new Error(`google_object_${res.status}`);
  return "updated";
}

/** Enlace "Guardar en Google Wallet" para un objeto ya creado. */
export function googleSaveUrl(data: WalletPassData, cfg: GoogleWalletConfig): string {
  const jwt = signJwt(
    {
      iss: cfg.clientEmail,
      aud: "google",
      typ: "savetowallet",
      origins: [getAppUrl()],
      payload: { loyaltyObjects: [{ id: googleObjectId(cfg, data.memberId), classId: googleClassId(cfg, data.programId) }] },
    },
    cfg.privateKey
  );
  return `https://pay.google.com/gp/v/save/${jwt}`;
}
