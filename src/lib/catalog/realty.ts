// Solo servidor. Fuente de catálogo del módulo Real Estate: propiedades
// publicadas y disponibles, con su foto de portada y su landing pública.

import { prisma } from "@/lib/prisma";
import { getAppUrl } from "@/lib/app-url";
import { realtyStrings, enumLabel } from "@/lib/i18n-realty";
import { priceText } from "@/lib/realty/page-helpers";
import { OPEN_STATUSES } from "@/lib/realty/constants";
import type { Prisma } from "@prisma/client";
import type { CatalogItem, CatalogSource } from "./types";

const select = {
  id: true,
  slug: true,
  title: true,
  operation: true,
  propertyType: true,
  status: true,
  price: true,
  currency: true,
  bedrooms: true,
  neighborhood: true,
  publishedAt: true,
  zone: { select: { name: true } },
  media: { orderBy: { sortOrder: "asc" }, take: 1, select: { id: true } },
} satisfies Prisma.RealtyPropertySelect;

type Row = Prisma.RealtyPropertyGetPayload<{ select: typeof select }>;

function toItem(p: Row): CatalogItem {
  const R = realtyStrings.es;
  const base = getAppUrl();
  const price = priceText(Number(p.price), p.currency);
  return {
    ref: `realty:${p.id}`,
    title: p.title,
    subtitle: [enumLabel(R, "type", p.propertyType), p.bedrooms ? `${p.bedrooms} rec` : null, p.neighborhood || p.zone.name].filter(Boolean).join(" · "),
    priceLabel: p.operation === "RENT" ? `${price} / mes` : price,
    imageUrl: p.media[0] ? `${base}/api/realty/media/${p.media[0].id}` : null,
    url: `${base}/p/${p.slug}?src=smartcard`,
    available: p.publishedAt !== null && OPEN_STATUSES.includes(p.status),
  };
}

export const realtySource: CatalogSource = {
  key: "realty",
  module: "REALTY",
  label: { es: "Real Estate", en: "Real Estate" },
  async list(organizationId, query) {
    const q = query?.trim();
    const rows = await prisma.realtyProperty.findMany({
      where: {
        organizationId,
        publishedAt: { not: null },
        status: { in: OPEN_STATUSES },
        ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { neighborhood: { contains: q, mode: "insensitive" } }, { zone: { name: { contains: q, mode: "insensitive" } } }] } : {}),
      },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select,
    });
    return rows.map(toItem);
  },
  async get(organizationId, id) {
    const p = await prisma.realtyProperty.findFirst({ where: { id, organizationId }, select });
    return p ? toItem(p) : null;
  },
};
