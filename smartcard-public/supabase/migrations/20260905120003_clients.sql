-- ---------------------------------------------------------------------------
-- clients (sección 22): cliente comercial, separado de profiles (sección 21).
-- Soft delete vía deleted_at: nunca se borra físicamente (sección 58).
-- ---------------------------------------------------------------------------
create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  business_name text,
  email text,
  phone text,
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'INACTIVE')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references admin_profiles (id) on delete set null,
  deleted_at timestamptz
);

comment on column clients.notes is
  'Notas internas de REYMEN. Nunca debe exponerse en ningún endpoint/función pública (sección 99).';
