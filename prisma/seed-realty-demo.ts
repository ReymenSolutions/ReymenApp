// Datos de DEMOSTRACIÓN para REYMEN Ops Realty (branch feature/realty-v1).
//
//   ALLOW_REALTY_DEMO_SEED=reymen-realty-demo npx tsx prisma/seed-realty-demo.ts
//
// Solo en una base de desarrollo: se bloquea en NODE_ENV=production y si la
// organización demo tiene propiedades o contactos que no son de la demo.
//
// Crea (o recrea) "REYMEN Realty Demo", una inmobiliaria ficticia de
// Monterrey con seis zonas (Cumbres, Valle Poniente, San Pedro, Carretera
// Nacional, Mitras y Apodaca; coordenadas aproximadas), asesores, prospectos
// (cada uno es un Lead del CRM), propiedades con fotos de muestra, eventos de
// la landing, visitas (citas de la agenda), cierres y campañas. Los datos
// cuentan historias que se ven en el tablero:
//   · San Pedro: mucha demanda de $6M–$10M y casi nada que les quede → captación.
//   · Apodaca: seis casas disponibles y un solo prospecto → sobreoferta.
//   · Mitras Centro: 140 días publicada, casi sin interés ni visitas → estancada.
//   · Cumbres Elite: nueva, con mucho interés y demanda → impulsar + match alto (Ana Martínez).
//   · Carretera Nacional: prospectos nuevos este mes vs. el anterior → zona emergente.
//   · Campañas eficientes (Meta Cumbres, SmartCard) y deficientes (Instagram Apodaca).
// Nombres inventados y teléfonos +52 81 00xx xxxx (rango inexistente).

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { Prisma, type AppointmentStatus, type RealtyCampaignChannel, type RealtyEventType, type RealtyOperation, type RealtyPropertyStatus, type RealtyPropertyType } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { propertySlug, zoneKey } from "../src/lib/realty/constants";
import { recomputeAllMatches } from "../src/lib/realty/service";

const ORG_SLUG = "reymen-realty-demo";
const ORG_NAME = "REYMEN Realty Demo";
const PASSWORD = "RealtyDemo2026!";
const DEMO_TAG = "realty-demo";
const DAY = 86_400_000;
const HOUR = 3_600_000;

let seedState = 20261117;
function rand(): number {
  seedState |= 0;
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
const roundTo = (n: number, step: number) => Math.round(n / step) * step;

function assertAllowed() {
  if (process.env.NODE_ENV === "production" || process.env.ALLOW_REALTY_DEMO_SEED !== ORG_SLUG) {
    throw new Error(`Demo bloqueada. Usa una base de desarrollo y ALLOW_REALTY_DEMO_SEED=${ORG_SLUG}; no se permite en producción.`);
  }
}

// ─── Zonas (punto aproximado, solo para el mapa) ─────────────────────
const ZONES = [
  { name: "Cumbres", lat: 25.733, lng: -100.404 },
  { name: "Valle Poniente", lat: 25.652, lng: -100.432 },
  { name: "San Pedro", lat: 25.6575, lng: -100.382 },
  { name: "Carretera Nacional", lat: 25.58, lng: -100.245 },
  { name: "Mitras", lat: 25.701, lng: -100.355 },
  { name: "Apodaca", lat: 25.781, lng: -100.188 },
] as const;
type ZoneName = (typeof ZONES)[number]["name"];

// ─── Prospectos ──────────────────────────────────────────────────────
interface ProspectSpec {
  name: string;
  operation: RealtyOperation;
  propertyType: RealtyPropertyType | null;
  min: number | null;
  max: number;
  zones: ZoneName[];
  beds?: number;
  baths?: number;
  area?: number;
  prefs?: string[];
  daysAgo: number;
  source: string;
  advisor: number;
  financing?: boolean;
  timeline?: string;
}

const FIRST = ["Ana", "Luis", "Sofía", "Carlos", "Valeria", "Jorge", "Daniela", "Miguel", "Fernanda", "Ricardo", "Paola", "Andrés", "Lucía", "Eduardo", "Regina", "Alejandro", "Mariana", "Héctor", "Camila", "Rodrigo", "Ximena", "Arturo", "Natalia", "Sergio", "Renata", "Óscar", "Andrea", "Javier", "Gabriela", "Iván", "Adriana", "Tomás", "Carolina", "Emilio", "Diana", "Raúl", "Elena", "Pablo", "Isabel", "Gerardo"];
const LAST = ["Martínez", "Garza", "Treviño", "Cantú", "Villarreal", "González", "Leal", "Elizondo", "Salinas", "Guerra", "Rodríguez", "Sepúlveda", "Benavides", "Montemayor", "Zambrano", "Lozano", "Cavazos", "Tamez", "Quiroga", "Sada"];
const SOURCES = ["SmartCard", "Meta", "Portal", "Referido", "WhatsApp", "Google"];

function prospects(): ProspectSpec[] {
  const out: ProspectSpec[] = [];
  // Ana Martínez: lo que busca es exactamente "Casa con jardín en Cumbres Elite" (match alto, sin visita aún).
  out.push({ name: "Ana Martínez", operation: "SALE", propertyType: "HOUSE", min: 3_800_000, max: 4_500_000, zones: ["Cumbres"], beds: 3, baths: 2, area: 190, prefs: ["parking", "garden"], daysAgo: 4, source: "SmartCard", advisor: 0, financing: true, timeline: "1–3 meses" });
  // Roberto: match alto con Cumbres Madeira y visita en unas horas sin confirmar.
  out.push({ name: "Roberto Leal", operation: "SALE", propertyType: "HOUSE", min: 4_000_000, max: 4_800_000, zones: ["Cumbres", "Mitras"], beds: 3, baths: 3, area: 200, prefs: ["parking"], daysAgo: 12, source: "Meta", advisor: 1 });
  // Cumbres: demanda sana de casas $3.5M–$5M.
  for (let i = 0; i < 7; i++) out.push({ name: "", operation: "SALE", propertyType: "HOUSE", min: roundTo(between(3_200_000, 3_800_000), 50_000), max: roundTo(between(4_300_000, 5_000_000), 50_000), zones: rand() < 0.5 ? ["Cumbres"] : ["Cumbres", "Mitras"], beds: pick([3, 3, 4]), baths: pick([2, 2.5, 3]), area: roundTo(between(170, 260), 10), prefs: pick([["parking", "pool"], ["parking", "garden"], ["security", "study"], ["parking", "pet_friendly"], ["terrace", "garden"]]), daysAgo: Math.floor(between(3, 80)), source: pick(SOURCES), advisor: i % 3 });
  // San Pedro: $6M–$9.5M, casi sin oferta que les quede → captación.
  for (let i = 0; i < 7; i++) out.push({ name: "", operation: "SALE", propertyType: "HOUSE", min: 6_000_000, max: roundTo(between(8_000_000, 9_500_000), 100_000), zones: rand() < 0.6 ? ["San Pedro", "Valle Poniente"] : ["San Pedro"], beds: 4, baths: 3, area: roundTo(between(260, 340), 10), prefs: pick([["security", "garden"], ["pool", "security"], ["study", "parking"]]), daysAgo: Math.floor(between(2, 85)), source: pick(["Referido", "Google", "SmartCard"]), advisor: 2, financing: rand() < 0.4 });
  // Valle Poniente: renta de departamentos $18k–$28k, una sola opción disponible.
  for (let i = 0; i < 6; i++) out.push({ name: "", operation: "RENT", propertyType: "APARTMENT", min: roundTo(between(15_000, 18_000), 500), max: roundTo(between(24_000, 28_000), 500), zones: rand() < 0.5 ? ["Valle Poniente", "San Pedro"] : ["Valle Poniente"], beds: 2, baths: 2, prefs: pick([["pet_friendly", "amenities"], ["amenities", "parking"], ["furnished", "amenities"], ["furnished", "terrace"]]), daysAgo: Math.floor(between(2, 60)), source: pick(SOURCES), advisor: 1, timeline: "Inmediato" });
  // Carretera Nacional: 5 nuevos en los últimos 25 días vs. 1 antes → zona emergente.
  for (let i = 0; i < 5; i++) out.push({ name: "", operation: "SALE", propertyType: "HOUSE", min: 3_000_000, max: roundTo(between(4_000_000, 4_600_000), 50_000), zones: ["Carretera Nacional"], beds: 3, baths: 2.5, area: 180, prefs: pick([["garden"], ["garden", "security"], ["terrace"]]), daysAgo: Math.floor(between(1, 25)), source: pick(["Meta", "Instagram", "SmartCard"]), advisor: 0 });
  out.push({ name: "", operation: "SALE", propertyType: "HOUSE", min: 3_200_000, max: 4_200_000, zones: ["Carretera Nacional"], beds: 3, daysAgo: 45, source: "Portal", advisor: 0 });
  // Mitras y Apodaca: poca demanda.
  for (let i = 0; i < 2; i++) out.push({ name: "", operation: "SALE", propertyType: "HOUSE", min: 2_400_000, max: 3_000_000, zones: ["Mitras"], beds: 3, baths: 2, daysAgo: Math.floor(between(20, 90)), source: pick(SOURCES), advisor: 1 });
  out.push({ name: "", operation: "SALE", propertyType: "HOUSE", min: 2_000_000, max: 2_800_000, zones: ["Apodaca"], beds: 3, daysAgo: 33, source: "Portal", advisor: 0 });
  out.push({ name: "", operation: "RENT", propertyType: "APARTMENT", min: 10_000, max: 14_000, zones: ["Mitras", "Cumbres"], beds: 2, daysAgo: 18, source: "WhatsApp", advisor: 1 });
  // Nombres únicos para los que no lo traen.
  const used = new Set(out.map((p) => p.name).filter(Boolean));
  for (const p of out) {
    if (p.name) continue;
    let n = "";
    do n = `${pick(FIRST)} ${pick(LAST)}`;
    while (used.has(n));
    used.add(n);
    p.name = n;
  }
  return out;
}

// ─── Propiedades ─────────────────────────────────────────────────────
interface PropertySpec {
  key: string;
  title: string;
  zone: ZoneName;
  neighborhood: string;
  operation: RealtyOperation;
  type: RealtyPropertyType;
  status: RealtyPropertyStatus;
  price: number;
  beds: number | null;
  baths: number | null;
  parking: number | null;
  built: number | null;
  land: number | null;
  age: number | null;
  features: string[];
  daysListed: number;
  /** Vistas por día en los últimos 45 días (los clics salen como proporción). */
  views: number;
  advisor: number;
  description: string;
}

function properties(): PropertySpec[] {
  const base: PropertySpec[] = [
    { key: "cumbres-elite", title: "Casa con jardín en Cumbres Elite", zone: "Cumbres", neighborhood: "Cumbres Elite", operation: "SALE", type: "HOUSE", status: "AVAILABLE", price: 4_250_000, beds: 3, baths: 2.5, parking: 2, built: 210, land: 180, age: 6, features: ["parking", "garden", "security"], daysListed: 10, views: 7, advisor: 0, description: "Casa de dos plantas con jardín, cochera para dos autos y acceso controlado. Cocina integral, cuarto de servicio y recámara principal con vestidor." },
    { key: "cumbres-madeira", title: "Casa en Cumbres Madeira", zone: "Cumbres", neighborhood: "Cumbres Madeira", operation: "SALE", type: "HOUSE", status: "AVAILABLE", price: 4_600_000, beds: 3, baths: 3, parking: 2, built: 230, land: 200, age: 4, features: ["parking", "security", "terrace"], daysListed: 35, views: 3.5, advisor: 1, description: "Casa con terraza y doble altura en sala. Tres recámaras con baño propio y estudio en planta baja." },
    { key: "cumbres-oro", title: "Departamento en Cumbres Oro", zone: "Cumbres", neighborhood: "Cumbres Oro", operation: "RENT", type: "APARTMENT", status: "AVAILABLE", price: 16_000, beds: 2, baths: 2, parking: 1, built: 95, land: null, age: 3, features: ["amenities", "parking", "security"], daysListed: 20, views: 2, advisor: 1, description: "Departamento con alberca y gimnasio en el edificio. Cocina equipada y balcón." },
    { key: "cumbres-almeria", title: "Casa en Cumbres Almería", zone: "Cumbres", neighborhood: "Cumbres Almería", operation: "SALE", type: "HOUSE", status: "AVAILABLE", price: 3_750_000, beds: 3, baths: 2, parking: 2, built: 175, land: 160, age: 9, features: ["parking", "pet_friendly"], daysListed: 28, views: 2, advisor: 2, description: "Casa con patio, cerca de escuelas y parques." },
    { key: "cumbres-renacimiento", title: "Casa en Cumbres Renacimiento", zone: "Cumbres", neighborhood: "Cumbres Renacimiento", operation: "SALE", type: "HOUSE", status: "AVAILABLE", price: 5_200_000, beds: 4, baths: 3.5, parking: 2, built: 260, land: 220, age: 2, features: ["parking", "study", "terrace", "security"], daysListed: 22, views: 2.5, advisor: 0, description: "Casa nueva con estudio y terraza techada." },
    { key: "cumbres-sanagustin", title: "Casa en Cumbres San Agustín", zone: "Cumbres", neighborhood: "San Agustín", operation: "SALE", type: "HOUSE", status: "SOLD", price: 3_950_000, beds: 3, baths: 2.5, parking: 2, built: 190, land: 160, age: 8, features: ["parking", "garden"], daysListed: 75, views: 1.5, advisor: 0, description: "Casa de una planta con jardín amplio." },
    { key: "sp-delvalle", title: "Residencia en Del Valle, San Pedro", zone: "San Pedro", neighborhood: "Del Valle", operation: "SALE", type: "HOUSE", status: "AVAILABLE", price: 15_500_000, beds: 4, baths: 4.5, parking: 3, built: 420, land: 480, age: 15, features: ["pool", "garden", "security", "study"], daysListed: 30, views: 2.5, advisor: 2, description: "Residencia con alberca, jardín y estudio. Zona exclusiva cerca de Calzada del Valle." },
    { key: "sp-valleoriente", title: "Departamento en Valle Oriente", zone: "San Pedro", neighborhood: "Valle Oriente", operation: "SALE", type: "APARTMENT", status: "NEGOTIATION", price: 7_800_000, beds: 3, baths: 3, parking: 2, built: 210, land: null, age: 2, features: ["amenities", "security", "parking"], daysListed: 55, views: 3, advisor: 2, description: "Departamento en torre con amenidades completas y vista a la Sierra Madre." },
    { key: "vp-depa", title: "Depa con amenidades en Valle Poniente", zone: "Valle Poniente", neighborhood: "Valle Poniente", operation: "RENT", type: "APARTMENT", status: "AVAILABLE", price: 24_000, beds: 2, baths: 2, parking: 2, built: 120, land: null, age: 2, features: ["amenities", "pet_friendly", "parking", "security"], daysListed: 15, views: 5, advisor: 1, description: "Departamento pet friendly con roof garden, gimnasio y dos cajones de estacionamiento." },
    { key: "vp-casa", title: "Casa en Valle Poniente", zone: "Valle Poniente", neighborhood: "Valle Poniente", operation: "SALE", type: "HOUSE", status: "RESERVED", price: 8_900_000, beds: 4, baths: 3.5, parking: 3, built: 320, land: 300, age: 5, features: ["garden", "security", "study"], daysListed: 42, views: 3, advisor: 2, description: "Casa en privada con estudio, jardín y cuarto de juegos." },
    { key: "cn-eluro", title: "Casa en Carretera Nacional, El Uro", zone: "Carretera Nacional", neighborhood: "El Uro", operation: "SALE", type: "HOUSE", status: "AVAILABLE", price: 4_100_000, beds: 3, baths: 2.5, parking: 2, built: 185, land: 200, age: 3, features: ["garden", "security"], daysListed: 50, views: 2.5, advisor: 0, description: "Casa rodeada de áreas verdes, en fraccionamiento con caseta de vigilancia." },
    { key: "mitras-centro", title: "Casa en Mitras Centro", zone: "Mitras", neighborhood: "Mitras Centro", operation: "SALE", type: "HOUSE", status: "AVAILABLE", price: 3_400_000, beds: 3, baths: 2, parking: 1, built: 165, land: 150, age: 30, features: ["parking"], daysListed: 140, views: 0.15, advisor: 1, description: "Casa tradicional para remodelar, cerca de avenidas principales." },
    { key: "mitras-depa", title: "Departamento en Mitras", zone: "Mitras", neighborhood: "Mitras Norte", operation: "RENT", type: "APARTMENT", status: "RENTED", price: 12_000, beds: 2, baths: 1, parking: 1, built: 80, land: null, age: 10, features: ["parking"], daysListed: 60, views: 1, advisor: 1, description: "Departamento funcional, listo para habitar." },
  ];
  // Apodaca: seis casas disponibles (sobreoferta), una inactiva y una vendida.
  const apodacaNames = ["Pueblo Nuevo", "Hacienda Las Margaritas", "Valle de Huinalá", "Misión de Fundadores", "Santa Rosa", "Rincón de Huinalá", "Los Encinos", "Privada Sur"];
  apodacaNames.forEach((n, i) => {
    base.push({
      key: `apodaca-${i}`,
      title: `Casa en ${n}, Apodaca`,
      zone: "Apodaca",
      neighborhood: n,
      operation: "SALE",
      type: "HOUSE",
      status: i === 6 ? "INACTIVE" : i === 7 ? "SOLD" : "AVAILABLE",
      price: roundTo(between(2_200_000, 3_400_000), 50_000),
      beds: 3,
      baths: pick([1.5, 2, 2.5]),
      parking: pick([1, 2]),
      built: roundTo(between(110, 160), 5),
      land: roundTo(between(105, 140), 5),
      age: Math.floor(between(1, 12)),
      features: pick([["parking"], ["parking", "security"], ["garden"]]),
      daysListed: Math.floor(between(60, 120)),
      views: between(0.3, 0.8),
      advisor: i % 3,
      description: "Casa en fraccionamiento con áreas verdes, cerca de escuelas y comercios.",
    });
  });
  return base;
}

// ─── Fotos de muestra (WebP generado, sin fotos reales) ──────────────
const PALETTES = [
  ["#031738", "#063C82"],
  ["#04275A", "#0b5cad"],
  ["#063C82", "#22C55E"],
  ["#080C13", "#04275A"],
];

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

async function placeholderPhoto(zone: string, variant: number): Promise<{ data: Buffer; width: number; height: number }> {
  const [a, b] = PALETTES[variant % PALETTES.length];
  const roof = variant % 2 === 0;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
  <rect width="1200" height="800" fill="url(#g)"/>
  <rect y="600" width="1200" height="200" fill="#EDECEB" opacity="0.18"/>
  <g transform="translate(${300 + (variant % 5) * 30} 230)" fill="#F2F4F6">
    ${roof ? '<polygon points="0,170 240,10 480,170" opacity="0.95"/>' : '<rect x="20" y="40" width="440" height="40" rx="6" opacity="0.95"/>'}
    <rect x="40" y="170" width="400" height="230" opacity="0.92"/>
    <rect x="200" y="270" width="80" height="130" fill="${a}"/>
    <rect x="80" y="220" width="80" height="70" fill="${b}" opacity="0.8"/>
    <rect x="320" y="220" width="80" height="70" fill="${b}" opacity="0.8"/>
  </g>
  <text x="60" y="720" font-family="Arial, Helvetica, sans-serif" font-size="30" font-weight="700" fill="#F2F4F6">${esc(zone)}</text>
  <text x="60" y="760" font-family="Arial, Helvetica, sans-serif" font-size="22" fill="#22C55E">Foto de muestra · REYMEN Realty Demo</text>
</svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).webp({ quality: 78 }).toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  assertAllowed();
  const now = Date.now();
  const existing = await prisma.organization.findUnique({ where: { slug: ORG_SLUG }, select: { id: true } });
  if (existing) {
    const [realProps, realLeads] = await Promise.all([
      prisma.realtyProperty.count({ where: { organizationId: existing.id, isDemo: false } }),
      prisma.lead.count({ where: { organizationId: existing.id, NOT: { tags: { has: DEMO_TAG } } } }),
    ]);
    if (realProps > 0 || realLeads > 0) throw new Error("Demo bloqueada: la organización tiene propiedades o contactos ajenos a la demo. No se modificó nada.");
  }
  console.log("🏠 Seed de demo REYMEN Ops Realty — REYMEN Realty Demo");

  const org = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: { name: ORG_NAME, isActive: true },
    create: { name: ORG_NAME, slug: ORG_SLUG, industry: "Inmobiliaria", n8nWebhookSecret: randomBytes(32).toString("hex"), timezone: "America/Monterrey" },
  });
  for (const mod of ["REALTY", "CRM"] as const) {
    await prisma.organizationModule.upsert({
      where: { organizationId_module: { organizationId: org.id, module: mod } },
      update: { status: "ACTIVE" },
      create: { organizationId: org.id, module: mod, status: "ACTIVE", source: "ADMIN_GRANTED", notes: "Demo REYMEN Ops Realty" },
    });
  }
  const hash = await bcrypt.hash(PASSWORD, 12);
  const people = [
    { email: "demo@realty.test", name: "Dirección REYMEN Realty", role: "OWNER" as const },
    { email: "laura@realty.test", name: "Laura Garza", role: "AGENT" as const },
    { email: "diego@realty.test", name: "Diego Treviño", role: "AGENT" as const },
    { email: "mariana@realty.test", name: "Mariana Cantú", role: "MANAGER" as const },
  ];
  const users = [];
  for (const p of people) {
    users.push(
      await prisma.user.upsert({
        where: { email: p.email },
        update: { organizationId: org.id, role: p.role, isActive: true, passwordHash: hash, name: p.name },
        create: { email: p.email, name: p.name, role: p.role, organizationId: org.id, passwordHash: hash },
      }),
    );
  }
  const advisors = users.slice(1); // Laura, Diego, Mariana

  // ─── Limpieza de una corrida anterior (solo esta organización demo) ──
  const oldVisits = await prisma.realtyPropertyVisit.findMany({ where: { organizationId: org.id }, select: { appointmentId: true } });
  await prisma.appointment.deleteMany({ where: { organizationId: org.id, id: { in: oldVisits.map((v) => v.appointmentId) } } });
  await prisma.realtyMatch.deleteMany({ where: { organizationId: org.id } });
  await prisma.realtyClosing.deleteMany({ where: { organizationId: org.id } });
  await prisma.realtyCampaign.deleteMany({ where: { organizationId: org.id } });
  await prisma.realtyLeadProfile.deleteMany({ where: { organizationId: org.id } });
  await prisma.realtyProperty.deleteMany({ where: { organizationId: org.id } });
  await prisma.realtyZone.deleteMany({ where: { organizationId: org.id } });
  await prisma.lead.deleteMany({ where: { organizationId: org.id, tags: { has: DEMO_TAG } } });

  await prisma.realtySettings.upsert({
    where: { organizationId: org.id },
    update: { publicWhatsapp: "+528100000000", defaultCurrency: "MXN" },
    create: { organizationId: org.id, publicWhatsapp: "+528100000000", defaultCurrency: "MXN" },
  });

  // ─── Zonas ──
  const zoneId = new Map<ZoneName, string>();
  for (const z of ZONES) {
    const row = await prisma.realtyZone.create({ data: { organizationId: org.id, name: z.name, key: zoneKey(z.name), latitude: z.lat, longitude: z.lng } });
    zoneId.set(z.name, row.id);
  }

  // ─── Prospectos (Lead del CRM + perfil inmobiliario) ──
  const specs = prospects();
  const profileIds = new Map<string, string>();
  let phoneSeq = 1000;
  for (const p of specs) {
    const createdAt = new Date(now - p.daysAgo * DAY - between(0, 10) * HOUR);
    const phone = `+528100${String(phoneSeq++).padStart(6, "0")}`;
    const lead = await prisma.lead.create({
      data: { organizationId: org.id, name: p.name, phone, phoneKey: phone.slice(-10), source: p.source, tags: ["realty", DEMO_TAG], status: "NEW", createdAt },
    });
    const profile = await prisma.realtyLeadProfile.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        advisorUserId: advisors[p.advisor % advisors.length].id,
        operation: p.operation,
        propertyType: p.propertyType,
        minBudget: p.min === null ? null : new Prisma.Decimal(p.min),
        maxBudget: new Prisma.Decimal(p.max),
        minBedrooms: p.beds ?? null,
        minBathrooms: p.baths ?? null,
        minArea: p.area ?? null,
        preferences: p.prefs ?? [],
        financingNeeded: p.financing ?? null,
        moveTimeline: p.timeline ?? null,
        source: p.source,
        createdAt,
        zones: { create: p.zones.map((z, i) => ({ organizationId: org.id, zoneId: zoneId.get(z)!, priority: i + 1 })) },
      },
    });
    profileIds.set(p.name, profile.id);
  }

  // ─── Propiedades, fotos, historial y eventos ──
  const propSpecs = properties();
  const propId = new Map<string, string>();
  const eventRows: Prisma.RealtyPropertyEventCreateManyInput[] = [];
  const SRC = ["smartcard", "meta", "direct", "qr", "instagram", "whatsapp"];
  let photoVariant = 0;
  for (const s of propSpecs) {
    const listed = new Date(now - s.daysListed * DAY);
    const row = await prisma.realtyProperty.create({
      data: {
        organizationId: org.id,
        advisorUserId: advisors[s.advisor % advisors.length].id,
        slug: propertySlug(s.title, randomBytes(4).toString("hex")),
        title: s.title,
        description: s.description,
        operation: s.operation,
        propertyType: s.type,
        status: s.status,
        price: new Prisma.Decimal(s.price),
        zoneId: zoneId.get(s.zone)!,
        neighborhood: s.neighborhood,
        addressLine: `Calle ficticia ${Math.floor(between(100, 999))}, ${s.neighborhood}`,
        bedrooms: s.beds,
        bathrooms: s.baths,
        parkingSpaces: s.parking,
        constructionArea: s.built,
        landArea: s.land,
        ageYears: s.age,
        furnished: s.features.includes("furnished") || null,
        features: s.features,
        publishedAt: s.status === "INACTIVE" ? null : listed,
        availableSince: listed,
        isDemo: true,
        createdAt: listed,
      },
    });
    propId.set(s.key, row.id);
    for (let i = 0; i < 2; i++) {
      const ph = await placeholderPhoto(s.zone, photoVariant++);
      await prisma.realtyPropertyMedia.create({ data: { organizationId: org.id, propertyId: row.id, mimeType: "image/webp", data: new Uint8Array(ph.data), width: ph.width, height: ph.height, sortOrder: i, altText: `${s.title} — foto de muestra ${i + 1}` } });
    }
    await prisma.realtyPropertyStatusHistory.create({ data: { organizationId: org.id, propertyId: row.id, fromStatus: null, toStatus: "AVAILABLE", changedById: users[0].id, changedAt: listed } });
    if (s.status !== "AVAILABLE") {
      await prisma.realtyPropertyStatusHistory.create({ data: { organizationId: org.id, propertyId: row.id, fromStatus: "AVAILABLE", toStatus: s.status, changedById: advisors[s.advisor % advisors.length].id, changedAt: new Date(now - Math.min(s.daysListed - 1, 20) * DAY) } });
    }
    // Eventos de la landing: hasta 45 días o desde que se publicó.
    const days = Math.min(45, s.daysListed);
    for (let d = 0; d < days; d++) {
      // Mitras Centro: el poco interés que tuvo fue al principio (nada reciente).
      if (s.key === "mitras-centro" && d < 32) continue;
      const dayStart = now - d * DAY;
      const views = Math.floor(s.views + rand() * 1.2 - 0.3);
      for (let v = 0; v < views; v++) {
        const at = new Date(dayStart - between(0.2, 23) * HOUR);
        const source = pick(SRC);
        const visitor = randomBytes(16).toString("hex");
        eventRows.push({ organizationId: org.id, propertyId: row.id, type: "VIEW", source, visitorHash: visitor, occurredAt: at });
        const r = rand();
        const click: RealtyEventType | null = r < 0.08 ? "WHATSAPP_CLICK" : r < 0.11 ? "SCHEDULE_CLICK" : r < 0.14 ? "SHARE_CLICK" : null;
        if (click) eventRows.push({ organizationId: org.id, propertyId: row.id, type: click, source, visitorHash: visitor, occurredAt: new Date(at.getTime() + 60_000) });
      }
    }
  }
  for (let i = 0; i < eventRows.length; i += 1000) await prisma.realtyPropertyEvent.createMany({ data: eventRows.slice(i, i + 1000) });

  // ─── Visitas (citas de la agenda + propiedad) ──
  const pid = (k: string) => propId.get(k)!;
  const prof = (name: string) => profileIds.get(name) ?? null;
  const randomProfile = (op: RealtyOperation, zone: ZoneName) => {
    const cands = specs.filter((p) => p.operation === op && p.zones.includes(zone) && p.name !== "Ana Martínez");
    return cands.length ? prof(pick(cands).name) : null;
  };
  const visits: { key: string; profileId: string | null; at: number; status: AppointmentStatus; advisor: number; outcome?: string }[] = [
    { key: "cumbres-madeira", profileId: prof("Roberto Leal"), at: now + 3 * HOUR, status: "SCHEDULED", advisor: 1 },
    { key: "vp-depa", profileId: randomProfile("RENT", "Valle Poniente"), at: now + 2 * DAY + 5 * HOUR, status: "CONFIRMED", advisor: 1 },
    { key: "sp-valleoriente", profileId: randomProfile("SALE", "San Pedro"), at: now + 4 * DAY + 2 * HOUR, status: "SCHEDULED", advisor: 2 },
    { key: "cumbres-madeira", profileId: randomProfile("SALE", "Cumbres"), at: now - 6 * DAY, status: "COMPLETED", advisor: 1, outcome: "Le gustó; pide revisar precio." },
    { key: "cumbres-madeira", profileId: randomProfile("SALE", "Cumbres"), at: now - 14 * DAY, status: "COMPLETED", advisor: 1, outcome: "Busca jardín más grande." },
    { key: "cumbres-elite", profileId: randomProfile("SALE", "Cumbres"), at: now - 3 * DAY, status: "COMPLETED", advisor: 0, outcome: "Muy interesado, segunda visita con su pareja." },
    { key: "vp-depa", profileId: randomProfile("RENT", "Valle Poniente"), at: now - 5 * DAY, status: "COMPLETED", advisor: 1, outcome: "Pide aceptar dos mascotas." },
    { key: "vp-depa", profileId: randomProfile("RENT", "Valle Poniente"), at: now - 9 * DAY, status: "COMPLETED", advisor: 1 },
    { key: "cn-eluro", profileId: randomProfile("SALE", "Carretera Nacional"), at: now - 8 * DAY, status: "COMPLETED", advisor: 0 },
    { key: "apodaca-0", profileId: randomProfile("SALE", "Apodaca"), at: now - 20 * DAY, status: "NO_SHOW", advisor: 0 },
    { key: "sp-valleoriente", profileId: randomProfile("SALE", "San Pedro"), at: now - 25 * DAY, status: "COMPLETED", advisor: 2, outcome: "Hizo oferta; en negociación." },
    { key: "vp-casa", profileId: randomProfile("SALE", "San Pedro"), at: now - 18 * DAY, status: "COMPLETED", advisor: 2, outcome: "Apartó con depósito." },
    { key: "cumbres-sanagustin", profileId: null, at: now - 40 * DAY, status: "COMPLETED", advisor: 0 },
    { key: "mitras-depa", profileId: null, at: now - 50 * DAY, status: "COMPLETED", advisor: 1 },
  ];
  const titleOf = new Map(propSpecs.map((s) => [s.key, s.title]));
  for (const v of visits) {
    const start = new Date(Math.round(v.at / (15 * 60_000)) * 15 * 60_000);
    const profileLead = v.profileId ? await prisma.realtyLeadProfile.findUnique({ where: { id: v.profileId }, select: { leadId: true } }) : null;
    const appt = await prisma.appointment.create({
      data: { organizationId: org.id, leadId: profileLead?.leadId ?? null, title: `Visita: ${titleOf.get(v.key)}`, startTime: start, endTime: new Date(start.getTime() + 45 * 60_000), status: v.status, source: "realty", metadata: { realtyPropertyId: pid(v.key), demo: true } },
    });
    await prisma.realtyPropertyVisit.create({ data: { organizationId: org.id, appointmentId: appt.id, propertyId: pid(v.key), profileId: v.profileId, advisorUserId: advisors[v.advisor].id, outcome: v.outcome ?? null } });
  }

  // ─── Cierres ──
  const closings = [
    { key: "cumbres-sanagustin", amount: 3_850_000, commission: 115_500, daysAgo: 25, advisor: 0, op: "SALE" as const },
    { key: "mitras-depa", amount: 12_000, commission: 12_000, daysAgo: 40, advisor: 1, op: "RENT" as const },
    { key: "apodaca-7", amount: 2_450_000, commission: 73_500, daysAgo: 50, advisor: 0, op: "SALE" as const },
  ];
  for (const c of closings) {
    await prisma.realtyClosing.create({
      data: { organizationId: org.id, propertyId: pid(c.key), advisorUserId: advisors[c.advisor].id, operation: c.op, finalAmount: new Prisma.Decimal(c.amount), commissionAmount: new Prisma.Decimal(c.commission), closedAt: new Date(now - c.daysAgo * DAY), notes: "Cierre de demostración" },
    });
  }

  // ─── Campañas (registro manual) ──
  const campaigns: { name: string; channel: RealtyCampaignChannel; key: string | null; spend: number; leads: number; visits: number; closings: number; revenue: number | null; days: number; status: "ACTIVE" | "PAUSED" | "ENDED" }[] = [
    { name: "Meta — Casas Cumbres", channel: "META", key: "cumbres-elite", spend: 12_000, leads: 48, visits: 9, closings: 1, revenue: 115_500, days: 40, status: "ACTIVE" },
    { name: "SmartCard — Valle Poniente", channel: "SMARTCARD", key: "vp-depa", spend: 1_500, leads: 14, visits: 4, closings: 0, revenue: null, days: 20, status: "ACTIVE" },
    { name: "Google — San Pedro", channel: "GOOGLE", key: "sp-delvalle", spend: 15_000, leads: 22, visits: 3, closings: 0, revenue: null, days: 30, status: "ACTIVE" },
    { name: "Instagram — Apodaca", channel: "INSTAGRAM", key: "apodaca-0", spend: 9_000, leads: 4, visits: 1, closings: 0, revenue: null, days: 45, status: "ACTIVE" },
    { name: "Portal — Mitras", channel: "PORTAL", key: "mitras-centro", spend: 3_000, leads: 0, visits: 0, closings: 0, revenue: null, days: 60, status: "PAUSED" },
  ];
  for (const c of campaigns) {
    await prisma.realtyCampaign.create({
      data: { organizationId: org.id, name: c.name, channel: c.channel, propertyId: c.key ? pid(c.key) : null, spend: new Prisma.Decimal(c.spend), startDate: new Date(now - c.days * DAY), leadsCount: c.leads, visitsCount: c.visits, closingsCount: c.closings, attributedRevenue: c.revenue === null ? null : new Prisma.Decimal(c.revenue), status: c.status },
    });
  }

  const matches = await recomputeAllMatches(org.id);
  console.log(`✅ ${ZONES.length} zonas, ${specs.length} prospectos (Leads del CRM), ${propSpecs.length} propiedades con fotos de muestra`);
  console.log(`✅ ${eventRows.length} eventos de landing, ${visits.length} visitas, ${closings.length} cierres, ${campaigns.length} campañas, ${matches} matches`);
  console.log(`\nEntra con demo@realty.test (dirección), mariana@realty.test (gerente), laura@realty.test o diego@realty.test (asesores) · contraseña ${PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
