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

// Entrypoint QR (ARCHITECTURE.md, apps/public/app/q/[code]) -- idéntica a
// /n/[code] salvo `source: 'QR'`. Ver resolveCardScan() para toda la lógica
// compartida.
export default async function QrEntryPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const { code } = await params
  const supabase = await createServerSupabaseClient()

  const result = await resolveCardScan(supabase, code, 'QR')

  if (result.kind === 'inactive') return <CardInactive />
  return <ProfileView profile={result.profile} slug={result.slug} source="QR" />
}
