-- ---------------------------------------------------------------------------
-- themes (sección 53): presets reutilizables, nunca CSS/HTML libre por cliente.
-- config es JSONB con tokens seguros (colores, tipografía de una lista
-- blanca, radio de bordes, variante de layout).
-- ---------------------------------------------------------------------------
create table themes (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column themes.config is
  'Tokens seguros únicamente: primary_color, accent_color, font (whitelist), border_radius, layout. Jamás CSS/HTML arbitrario.';
