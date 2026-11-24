import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getRetailContext } from "@/lib/retail/context";
import { PrintLabelButton } from "@/components/retail/PrintLabelButton";
import "./print.css";

export default async function RetailLabelPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getRetailContext();
  const { id } = await params;
  const item = await prisma.retailItem.findFirst({ where: { id, organizationId: ctx.organizationId }, select: { code: true, brand: true, garmentType: true, size: true } });
  if (!item) notFound();
  // The code is the QR payload. No public URL or tenant data is embedded.
  const qr = await QRCode.toDataURL(item.code, { margin: 1, width: 320, errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  const en = ctx.lang === "en";
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-semibold">{en ? "Item label" : "Etiqueta de prenda"}</h2><p className="text-sm text-slate-600 dark:text-slate-300">{en ? "Check the code and print on your label stock." : "Verifica el código e imprime en tus etiquetas."}</p></div><div className="flex gap-2"><Link href="/portal/retail/inventory" className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-slate-600">{en ? "Back" : "Volver"}</Link><PrintLabelButton lang={ctx.lang} /></div></div>
    <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900"><div id="retail-print-label" className="mx-auto flex w-52 flex-col items-center border border-slate-300 bg-white p-2 text-center text-black"><Image src={qr} alt={`QR ${item.code}`} width={136} height={136} unoptimized /><strong className="mt-1 break-all text-xs">{item.code}</strong><span className="max-w-full truncate text-[10px]">{[item.brand, item.garmentType, item.size].filter(Boolean).join(" · ")}</span></div></div>
    <a href={qr} download={`retail-${item.code}.png`} className="inline-block text-sm font-medium text-[#063C82] underline dark:text-blue-300">{en ? "Download QR PNG" : "Descargar QR PNG"}</a>
  </div>;
}
