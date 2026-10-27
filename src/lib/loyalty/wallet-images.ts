// Imágenes del pase: el ícono de la tarjeta (el mismo que eligió el negocio
// en Lealtad) sobre su color de acento. Se generan al vuelo con sharp, así
// cada negocio tiene su propio ícono sin subir archivos.
//
// Los trazos salen de los mismos íconos de lucide que usa la tarjeta web
// (su __iconNode), armados como SVG a mano: en rutas de servidor Next no
// permite react-dom/server.

import sharp from "sharp";
import type { CardIconKey } from "./card-style";
import { __iconNode as coffee } from "lucide-react/dist/esm/icons/coffee.js";
import { __iconNode as utensils } from "lucide-react/dist/esm/icons/utensils.js";
import { __iconNode as pizza } from "lucide-react/dist/esm/icons/pizza.js";
import { __iconNode as croissant } from "lucide-react/dist/esm/icons/croissant.js";
import { __iconNode as iceCream } from "lucide-react/dist/esm/icons/ice-cream-cone.js";
import { __iconNode as beer } from "lucide-react/dist/esm/icons/beer.js";
import { __iconNode as wine } from "lucide-react/dist/esm/icons/wine.js";
import { __iconNode as sandwich } from "lucide-react/dist/esm/icons/sandwich.js";
import { __iconNode as scissors } from "lucide-react/dist/esm/icons/scissors.js";
import { __iconNode as sparkles } from "lucide-react/dist/esm/icons/sparkles.js";
import { __iconNode as dumbbell } from "lucide-react/dist/esm/icons/dumbbell.js";
import { __iconNode as shoppingBag } from "lucide-react/dist/esm/icons/shopping-bag.js";
import { __iconNode as pawPrint } from "lucide-react/dist/esm/icons/paw-print.js";
import { __iconNode as car } from "lucide-react/dist/esm/icons/car.js";
import { __iconNode as heart } from "lucide-react/dist/esm/icons/heart.js";
import { __iconNode as star } from "lucide-react/dist/esm/icons/star.js";
import { __iconNode as gift } from "lucide-react/dist/esm/icons/gift.js";

type IconNode = [string, Record<string, string>][];

const NODES: Record<CardIconKey, IconNode> = {
  coffee, utensils, pizza, croissant, "ice-cream": iceCream, beer, wine, sandwich, scissors, sparkles, dumbbell,
  "shopping-bag": shoppingBag, "paw-print": pawPrint, car, heart, star, gift,
};

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** El ícono como SVG de 24×24 (trazo `color`), colocado en (x, y) con lado `size`. */
export function iconSvg(icon: CardIconKey, color: string, x: number, y: number, size: number): string {
  const parts = (NODES[icon] ?? NODES.gift)
    .map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${esc(String(v))}"`).join(" ")}/>`)
    .join("");
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${esc(color)}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${parts}</svg>`;
}

const cache = new Map<string, Buffer>();

/**
 * PNG cuadrado de `size` px: fondo `background` (redondeado si `round`), el
 * ícono en `color` al centro ocupando ~56 % del lado.
 */
export async function renderIconPng(icon: CardIconKey, background: string, color: string, size: number, round = false): Promise<Buffer> {
  const key = `${icon}|${background}|${color}|${size}|${round}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const inner = Math.round(size * 0.56);
  const pad = Math.round((size - inner) / 2);
  const radius = round ? size / 2 : Math.round(size * 0.22);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="${esc(background)}"/>${iconSvg(icon, color, pad, pad, inner)}</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  if (cache.size > 200) cache.clear();
  cache.set(key, png);
  return png;
}
