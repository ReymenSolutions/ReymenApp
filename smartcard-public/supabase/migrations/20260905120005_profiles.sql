-- ---------------------------------------------------------------------------
-- profiles (sección 23): perfil digital. Un client puede tener varios
-- profiles a futuro (sección 21), aunque hoy la mayoría tenga solo uno.
-- theme_overrides es la "personalización nivel 1" (colores/logo de marca)
-- sin necesitar un theme nuevo por cliente.
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  first_name text,
  last_name text,
  display_name text not null,
  job_title text,
  company text,
  bio text,
  photo_url text,
  logo_url text,
  phone text,
  whatsapp text,
  email text,
  website text,
  address text,
  maps_url text,
  instagram text,
  facebook text,
  linkedin text,
  tiktok text,
  youtube text,
  theme_id uuid references themes (id) on delete set null,
  theme_overrides jsonb not null default '{}'::jsonb,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  is_noindex boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references admin_profiles (id) on delete set null,
  deleted_at timestamptz
);

comment on column profiles.slug is
  'Único entre perfiles activos (ver índice parcial en 000011). Formato restringido a minúsculas/números/guiones. Validado también contra reserved_slugs vía trigger.';
comment on column profiles.theme_overrides is
  'Overrides de marca sobre el theme base (primary_color, accent_color, logo). Mismo esquema controlado que themes.config, nunca CSS libre.';
