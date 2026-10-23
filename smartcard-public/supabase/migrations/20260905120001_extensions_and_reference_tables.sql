-- Extensiones necesarias
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Catálogo de tipos de destino.
-- Se modela como TABLA (no como ENUM de Postgres) precisamente porque la
-- sección 9 del prompt original pide "flexibilidad para agregar nuevos tipos
-- posteriormente". Agregar un tipo nuevo es un INSERT, no una migración de
-- esquema ni un ALTER TYPE.
-- ---------------------------------------------------------------------------
create table destination_types (
  code text primary key,
  label text not null,
  requires_profile boolean not null default false,
  requires_url boolean not null default true,
  is_active boolean not null default true,
  sort_order integer not null default 0
);

comment on table destination_types is
  'Catálogo de tipos de destino para SmartCards. requires_profile/requires_url alimentan la validación de cards (ver validate_card_destination()).';

insert into destination_types (code, label, requires_profile, requires_url, sort_order) values
  ('PROFILE',        'Perfil digital',      true,  false, 1),
  ('GOOGLE_REVIEWS',  'Google Reviews',      false, true,  2),
  ('WHATSAPP',        'WhatsApp',            false, true,  3),
  ('INSTAGRAM',       'Instagram',           false, true,  4),
  ('MAPS',            'Google Maps',         false, true,  5),
  ('WEBSITE',         'Sitio web',           false, true,  6),
  ('CUSTOM_URL',      'URL personalizada',   false, true,  7);

-- ---------------------------------------------------------------------------
-- Slugs reservados (sección 11). Tabla en vez de lista hardcodeada en el
-- código: agregar una palabra reservada nueva es un INSERT, no un deploy.
-- ---------------------------------------------------------------------------
create table reserved_slugs (
  slug text primary key
);

insert into reserved_slugs (slug) values
  ('admin'), ('api'), ('login'), ('logout'), ('n'), ('q'), ('smartcard'),
  ('dashboard'), ('settings'), ('app'), ('link'), ('www'), ('static'),
  ('assets'), ('public'), ('health'), ('status'), ('terms'), ('privacy'),
  ('contact'), ('about'), ('robots.txt'), ('sitemap.xml'), ('favicon.ico'),
  ('images'), ('_next');
