-- ---------------------------------------------------------------------------
-- Fase 11 (apps/public): get_public_profile() no traía el `id` de cada link,
-- solo title/url/icon/type -- suficiente para pintarlos, pero no para que
-- apps/public pueda mandar un clic a través de una ruta que lo registre en
-- `events` con `p_link_id` (el parámetro que log_event() ya aceptaba desde
-- Fase 2, sin nada todavía que lo usara). Sin el id no hay forma de
-- distinguir "el link 2 de este perfil" al construir /l/{linkId} sin abrir
-- un segundo hueco de seguridad (aceptar la URL de destino como parámetro
-- del lado del cliente sería un open redirect). Mismo cuerpo que la versión
-- original de 000013, solo se agrega 'id', l.id al jsonb_build_object.
-- ---------------------------------------------------------------------------
create or replace function get_public_profile(p_slug text)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select jsonb_build_object(
    'display_name', p.display_name,
    'job_title', p.job_title,
    'company', p.company,
    'bio', p.bio,
    'photo_url', p.photo_url,
    'logo_url', p.logo_url,
    'phone', p.phone,
    'whatsapp', p.whatsapp,
    'email', p.email,
    'website', p.website,
    'address', p.address,
    'maps_url', p.maps_url,
    'instagram', p.instagram,
    'facebook', p.facebook,
    'linkedin', p.linkedin,
    'tiktok', p.tiktok,
    'youtube', p.youtube,
    'is_noindex', p.is_noindex,
    'theme', jsonb_build_object(
      'slug', t.slug,
      'config', t.config,
      'overrides', p.theme_overrides
    ),
    'links', coalesce((
      select jsonb_agg(
        jsonb_build_object('id', l.id, 'title', l.title, 'url', l.url, 'icon', l.icon, 'type', l.type)
        order by l.sort_order
      )
      from profile_links l
      where l.profile_id = p.id and l.is_active = true
    ), '[]'::jsonb)
  )
  from profiles p
  left join themes t on t.id = p.theme_id
  where p.slug = p_slug and p.status = 'ACTIVE' and p.deleted_at is null;
$$;

-- create or replace no cambia los privilegios, pero se re-otorgan explícitos
-- por si alguna vez esto se aplica sobre una base donde el grant original no
-- se aplicó (mismo hábito defensivo que el resto de las migraciones).
revoke all on function get_public_profile(text) from public;
grant execute on function get_public_profile(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- get_link_for_redirect(): la pieza que faltaba para que apps/public pueda
-- registrar el clic de un link del perfil (`custom_link_click`, con
-- `p_link_id`) SIN exponer `profile_links` directamente a `anon` -- esa
-- tabla nunca tuvo policy de SELECT para anon a propósito (rls_policies.sql,
-- Fase 2: "SUPERADMIN+ADMIN gestionan, VIEWER solo lee", ninguno es anon).
-- Confirma también que el perfil dueño del link sigue ACTIVE y no borrado --
-- un link cuyo perfil se dio de baja después de compartirse dej de
-- funcionar, en vez de seguir redirigiendo a un perfil que ya no debería
-- verse.
-- ---------------------------------------------------------------------------
create or replace function get_link_for_redirect(p_link_id uuid)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select jsonb_build_object('url', l.url, 'profile_slug', p.slug)
  from profile_links l
  join profiles p on p.id = l.profile_id
  where l.id = p_link_id
    and l.is_active = true
    and p.status = 'ACTIVE'
    and p.deleted_at is null;
$$;

revoke all on function get_link_for_redirect(uuid) from public;
grant execute on function get_link_for_redirect(uuid) to anon, authenticated;
