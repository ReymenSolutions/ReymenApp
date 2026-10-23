import type { Metadata } from 'next'
import { createServerSupabaseClient } from '@reymen/database'
import { ProfileView } from '../../components/ProfileView'
import { fetchPublicProfile } from '../../lib/profile'
import { logPublicEvent } from '../../lib/track'
import { getSiteUrl } from '../../lib/site-url'

// La URL "oficial" de un perfil (sección 98 de ARCHITECTURE.md) -- la misma
// vista se renderiza también en /n/{code} y /q/{code} (ver esas carpetas),
// pero esta es la que va en el canonical y la que se comparte.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.rpc('get_public_profile', { p_slug: slug })

  if (!data) return {}

  const profile = data as { display_name: string; job_title: string | null; company: string | null; bio: string | null; is_noindex: boolean }
  const siteUrl = await getSiteUrl()
  const title = [profile.display_name, profile.company].filter(Boolean).join(' · ')
  const description = profile.bio ?? [profile.job_title, profile.company].filter(Boolean).join(' en ')

  return {
    title,
    description: description || undefined,
    alternates: { canonical: `${siteUrl}/${slug}` },
    robots: profile.is_noindex ? { index: false, follow: false } : undefined,
    openGraph: { title, description, url: `${siteUrl}/${slug}` },
  }
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createServerSupabaseClient()
  const profile = await fetchPublicProfile(supabase, slug)

  await logPublicEvent(supabase, { event_type: 'profile_view', source: 'DIRECT', profile_slug: slug })

  return <ProfileView profile={profile} slug={slug} />
}
