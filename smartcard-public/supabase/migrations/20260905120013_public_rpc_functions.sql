-- ---------------------------------------------------------------------------
-- Único punto de acceso público (rol anon). Cuatro funciones SECURITY
-- DEFINER, cada una devolviendo exactamente los campos que necesita el caso
-- de uso público correspondiente — nunca una tabla completa. Esto es la
-- respuesta concreta a la sección 99 ("no usar SELECT * indiscriminadamente
-- en APIs públicas"): el filtrado de columnas vive en la base de datos, no
-- solo en el código de la aplicación.
--
-- Las firmas son el "esqueleto" con el que se construirán las rutas /n/,
-- /q/, /[slug] y /api/vcard en fases posteriores (9, 11, 13); aquí quedan
-- funcionando y probadas por sí solas.
-- ---------------------------------------------------------------------------

-- Usada por /n/{code} y /q/{code} para decidir qué hacer con una tarjeta.
create or replace function get_card_for_redirect(p_card_code text)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select jsonb_build_object(
    'destination_type', c.destination_type,
    'destination_url', c.destination_url,
    'profile_slug', p.slug,
    'card_status', c.status
  )
  from cards c
  left join profiles p on p.id = c.profile_id and p.deleted_at is null
  where c.card_code = p_card_code and c.deleted_at is null;
$$;

revoke all on function get_card_for_redirect(text) from public;
grant execute on function get_card_for_redirect(text) to anon, authenticated;

-- Usada por /[slug] para renderizar el perfil digital, incluyendo sus links
-- activos y el theme resuelto, en una sola llamada.
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
        jsonb_build_object('title', l.title, 'url', l.url, 'icon', l.icon, 'type', l.type)
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

revoke all on function get_public_profile(text) from public;
grant execute on function get_public_profile(text) to anon, authenticated;

-- Usada por /api/vcard/{slug}: únicamente los campos que un .vcf necesita.
create or replace function get_vcard_data(p_slug text)
returns jsonb
language sql security definer stable
set search_path = public
as $$
  select jsonb_build_object(
    'first_name', p.first_name,
    'last_name', p.last_name,
    'company', p.company,
    'job_title', p.job_title,
    'phone', p.phone,
    'whatsapp', p.whatsapp,
    'email', p.email,
    'website', p.website,
    'address', p.address
  )
  from profiles p
  where p.slug = p_slug and p.status = 'ACTIVE' and p.deleted_at is null;
$$;

revoke all on function get_vcard_data(text) from public;
grant execute on function get_vcard_data(text) to anon, authenticated;

-- Único camino para escribir en events desde el público. Acepta card_code
-- (rutas /n/, /q/) o profile_slug (clics dentro de un perfil ya renderizado).
create or replace function log_event(
  p_event_type text,
  p_source text,
  p_card_code text default null,
  p_profile_slug text default null,
  p_link_id uuid default null,
  p_user_agent text default null,
  p_referrer text default null,
  p_device_type text default null,
  p_is_bot boolean default false
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_card_id uuid;
  v_profile_id uuid;
begin
  if p_card_code is not null then
    select id, profile_id into v_card_id, v_profile_id
    from cards where card_code = p_card_code and deleted_at is null;
  elsif p_profile_slug is not null then
    select id into v_profile_id
    from profiles where slug = p_profile_slug and deleted_at is null;
  end if;

  insert into events (card_id, profile_id, link_id, event_type, source, user_agent, referrer, device_type, is_bot)
  values (
    v_card_id, v_profile_id, p_link_id, p_event_type, p_source,
    left(p_user_agent, 500), left(p_referrer, 500), p_device_type,
    coalesce(p_is_bot, false)
  );
end;
$$;

revoke all on function log_event(text, text, text, text, uuid, text, text, text, boolean) from public;
grant execute on function log_event(text, text, text, text, uuid, text, text, text, boolean) to anon, authenticated;
