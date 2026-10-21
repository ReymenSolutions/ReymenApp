// Solo servidor. Código postal → estado, municipio y colonias, con el
// catálogo oficial de SEPOMEX empaquetado en @webrek/mx-cp (MIT; los datos
// viven en el paquete, sin API ni llave, y se cargan por prefijo bajo demanda).
// Es el primer paso de la dirección: con el CP la persona ya no escribe
// municipio ni estado, y elige la colonia de una lista.

import { buscaCP } from "@webrek/mx-cp";

export interface PostalInfo {
  cp: string;
  estado: string;
  municipio: string;
  ciudad: string | null;
  colonias: { nombre: string; tipo: string }[];
}

export function isPostalCode(cp: string): boolean {
  return /^\d{5}$/.test(cp);
}

export async function lookupPostalCode(cp: string): Promise<PostalInfo | null> {
  const clean = cp.trim();
  if (!isPostalCode(clean)) return null;
  const r = await buscaCP(clean);
  if (!r) return null;
  return {
    cp: r.cp,
    estado: r.estado,
    municipio: r.municipio,
    ciudad: r.ciudad,
    colonias: [...r.asentamientos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")).map((a) => ({ nombre: a.nombre, tipo: a.tipo })),
  };
}
