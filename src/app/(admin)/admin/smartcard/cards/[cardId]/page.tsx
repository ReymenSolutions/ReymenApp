import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/guards";
import { getSmartcardCard, listSmartcardClientOptions, listSmartcardProfileOptions } from "@/lib/smartcard-admin";
import { getActiveDestinationTypes, buildSmartcardPublicUrl, buildSmartcardPreviewUrl } from "@/lib/smartcard-company";
import { PageHeader } from "@/components/shared/PageHeader";
import { SmartcardCardForm } from "@/components/admin/SmartcardCardForm";
import { SmartcardCardDangerZone } from "@/components/admin/SmartcardCardDangerZone";
import { SmartcardCardQrButton } from "@/components/admin/SmartcardCardQrButton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

export default async function SmartcardCardDetailPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  await requireAdmin();
  const { cardId } = await params;

  const [card, clients, destinationTypes, profiles] = await Promise.all([
    getSmartcardCard(cardId),
    listSmartcardClientOptions(),
    getActiveDestinationTypes(),
    listSmartcardProfileOptions(),
  ]);

  if (!card) notFound();

  return (
    <div>
      <Link href="/admin/smartcard/cards" className="mb-4 inline-block text-sm text-slate-500 hover:underline">
        ← Volver a tarjetas
      </Link>

      <PageHeader
        title={card.cardCode ?? "(sin código)"}
        description="El código no se puede cambiar — lo generó Postgres al crear la tarjeta."
        actions={
          card.deletedAt ? (
            <Badge variant="outline" className="border-slate-300 text-slate-500">
              Dada de baja
            </Badge>
          ) : undefined
        }
      />

      {card.cardCode && (
        <div className="mb-6 flex items-center gap-3 rounded-md border border-slate-200 p-4 text-sm">
          <div className="flex-1">
            <p className="text-slate-500">
              Apunta a{" "}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{buildSmartcardPublicUrl(card.cardCode)}</code>
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={buildSmartcardPreviewUrl(card.cardCode)} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              Visitar tarjeta
            </a>
          </Button>
          <SmartcardCardQrButton cardId={card.id} cardCode={card.cardCode} />
        </div>
      )}

      <SmartcardCardForm
        cardId={card.id}
        clients={clients ?? []}
        destinationTypes={destinationTypes}
        profiles={profiles ?? []}
        initial={{
          clientId: card.clientId,
          destinationType: card.destinationType,
          profileId: card.profileId,
          destinationUrl: card.destinationUrl,
          notes: card.notes,
          status: card.status,
        }}
      />

      <div className="mt-8">
        <SmartcardCardDangerZone cardId={card.id} deleted={!!card.deletedAt} />
      </div>
    </div>
  );
}
