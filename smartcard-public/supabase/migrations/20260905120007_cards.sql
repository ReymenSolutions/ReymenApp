-- ---------------------------------------------------------------------------
-- cards (sección 24): la SmartCard. card_code se genera por trigger
-- (ver 000010) — nunca se envía desde la aplicación en un alta normal.
-- La validación "profile_id obligatorio si PROFILE, destination_url
-- obligatorio si no" se hace con un trigger (000010) apoyado en
-- destination_types, no con un CHECK estático, para que agregar un tipo
-- nuevo no requiera tocar esta tabla.
-- ---------------------------------------------------------------------------
create table cards (
  id uuid primary key default gen_random_uuid(),
  card_code text unique,
  client_id uuid not null references clients (id) on delete restrict,
  profile_id uuid references profiles (id) on delete restrict,
  destination_type text not null references destination_types (code),
  destination_url text check (destination_url is null or destination_url ~* '^https?://'),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references admin_profiles (id) on delete set null,
  deleted_at timestamptz
);

comment on column cards.card_code is
  'Código comercial legible (REY-000001...). No confundir con id (UUID interno, ver sección 8 del prompt original y ARCHITECTURE.md sección 9).';
comment on column cards.destination_url is
  'Solo esquemas http(s) a nivel de base de datos como defensa en profundidad; la validación completa (bloquear javascript:, data:, open redirects) vive en la aplicación (Fase 9/10).';
