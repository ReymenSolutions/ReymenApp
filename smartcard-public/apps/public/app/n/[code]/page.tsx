import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@reymen/database'
import { ProfileView } from '../../../components/ProfileView'
import { CardInactive } from '../../../components/CardInactive'
import { resolveCardScan, buildCardScanMetadata } from '../../../lib/card-redirect'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ code: string }>
}): Promise<Metadata> {
  const { code } = await params
  const supabase = await createServerSupabaseClient()
  return buildCardScanMetadata(supabase, code)
}

// Entrypoint NFC (ARCHITECTURE.md, apps/public/app/n/[code]). Toda la
// lógica (destino PROFILE vs. externo, tarjeta inactiva, tarjeta
// inexistente, qué se registra en `events`) vive en resolveCardScan() --
// compartida al 100% con /q/[code], que es idéntica salvo `source`.
export default async function NfcEntryPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const supabase = await createServerSupabaseClient()

  const result = await resolveCardScan(supabase, code, 'NFC')

  if (result.kind === 'inactive') return <CardInactive />
  return <ProfileView profile={result.profile} slug={result.slug} source="NFC" />
}
