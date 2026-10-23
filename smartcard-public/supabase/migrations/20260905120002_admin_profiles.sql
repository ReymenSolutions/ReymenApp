-- ---------------------------------------------------------------------------
-- admin_profiles: extiende auth.users con rol y estado (sección 19).
-- Se crea manualmente junto con el usuario de Supabase Auth (service_role),
-- nunca por registro público. El primer SUPERADMIN se crea a mano en Fase 4;
-- después SUPERADMIN invita a los demás.
-- ---------------------------------------------------------------------------
create table admin_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('SUPERADMIN', 'ADMIN', 'VIEWER')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table admin_profiles is
  'Rol y estado de cada usuario administrativo. 1:1 con auth.users. Sin registro público: se crea junto con el auth.users vía service_role.';
