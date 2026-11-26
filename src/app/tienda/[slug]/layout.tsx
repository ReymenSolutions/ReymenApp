import { notFound } from "next/navigation";
import { getStorefront } from "@/lib/retail/public/source";
import { RetailShell } from "@/components/retail-public/RetailShell";

// Web pública de ventas de Retail: /tienda/<slug>. Sin sesión (ver src/proxy.ts). Sin el módulo RETAIL activo la tienda
// no existe (404). Contrato con el inventario: docs/retail/WEB-CONTRACT.md.
export default async function TiendaLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const shop = await getStorefront(slug);
  if (!shop) notFound();
  return <RetailShell orgName={shop.orgName} slug={shop.slug}>{children}</RetailShell>;
}
