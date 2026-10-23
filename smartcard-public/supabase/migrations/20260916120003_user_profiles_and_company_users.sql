-- ---------------------------------------------------------------------------
-- REYMEN Ops -- Fase 1 (Core), migración 3 de 6.
--
-- user_profiles (sección 6 del prompt maestro, tabla `profiles` ahí) --
-- RENOMBRADA a user_profiles porque `profiles` ya existe en este proyecto
-- con otro significado (perfil de tarjeta pública, Fase 2). Documentado en
-- REYMEN_OPS_PLAN.md sección 11 (riesgo 1) -- no es un descuido.
--
-- company_users (sección 5): el corazón del self-serve -- usuario de
-- auth.users ligado a una company con un rol. Sin esto, apps/ops no puede
-- resolver "qué empresa es esta sesión".
-- ---------------------------------------------------------------------------

create table user_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table user_profiles is
  'Datos de perfil de un usuario de auth.users que usa apps/ops (empleado de una company). 1:1 con auth.users, igual que admin_profiles para el staff interno -- pero estas dos tablas nunca se mezclan.';

create table company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references roles (id),
  branch_id uuid references branches (id) on delete set null,
  status text not null default 'invited'
    check (status in ('invited', 'active', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

comment on table company_users is
  'Membresía de un usuario en una company, con su rol. Un usuario puede pertenecer a más de una company (unique es por par company+user, no global) -- ver AUTH.md / REYMEN_OPS_PLAN.md sección 6.';

create index company_users_user_id_idx on company_users (user_id);
create index company_users_company_id_idx on company_users (company_id);
