-- ---------------------------------------------------------------------------
-- Productos en el perfil público (2026-10-21).
--
-- REYMEN Ops (app.reymen.mx) deja agregar al perfil productos de sus módulos
-- (hoy propiedades de Real Estate; después, por ejemplo, el menú de Food).
-- Cada producto es una fila de profile_links con type = 'product' más una
-- copia de lo que muestra la tarjeta: subtitle, price_label, image_url.
-- source_ref ("realty:<id>") dice de qué registro salió, para que REYMEN Ops
-- actualice la copia cuando cambia (precio, foto) o la oculte cuando ya no
-- está disponible. Se reusa profile_links a propósito: /l/{linkId} ya
-- registra el clic en `events`, así que los productos traen analítica sin
-- una ruta nueva.
--
-- Solo agrega columnas (todas opcionales) y vuelve a crear
-- get_public_profile() con esos tres campos en cada link; los links que ya
-- existen no cambian. source_ref NO se expone en la función pública.
-- ---------------------------------------------------------------------------

alter table profile_links
  add column if not exists subtitle text,
  add column if not exists price_label text,
  add column if not exists image_url text,
  add column if not exists source_ref text;

alter table profile_links drop constraint if exists profile_links_image_url_check;
alter table profile_links add constraint profile_links_image_url_check
  check (image_url is null or image_url ~* '^https://');

alter table profile_links drop constraint if exists profile_links_product_lengths_check;
alter table profile_links add constraint profile_links_product_lengths_check check (
  char_length(coalesce(subtitle, '')) <= 200
  and char_length(coalesce(price_label, '')) <= 80
  and char_length(coalesce(source_ref, '')) <= 120
);

create index if not exists profile_links_source_ref_idx
  on profile_links (source_ref) where source_ref is not null;

-- Mismo cuerpo que 20260909120001_public_profile_link_ids.sql; solo se
-- agregan subtitle, price_label e image_url a cada link.
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
        jsonb_build_object(
          'id', l.id, 'title', l.title, 'url', l.url, 'icon', l.icon, 'type', l.type,
          'subtitle', l.subtitle, 'price_label', l.price_label, 'image_url', l.image_url
        )
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
