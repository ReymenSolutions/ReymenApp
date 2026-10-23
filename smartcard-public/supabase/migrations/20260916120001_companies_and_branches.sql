-- ---------------------------------------------------------------------------
-- REYMEN Ops -- Fase 1 (Core), migración 1 de 6. Ver REYMEN_OPS_PLAN.md
-- secciones 3 y 4 para el plan completo.
--
-- companies/branches (secciones 5, 21 del prompt maestro). Regla dura de esta
-- fase: NADA de lo que ya existe se borra ni se renombra. `clients` se queda
-- funcionando exactamente igual para apps/admin y apps/public -- esta
-- migración solo le agrega `company_id` (nullable) y hace el backfill: cada
-- client existente (incluyendo los soft-deleted, para no perder trazabilidad)
-- genera su companies correspondiente.
-- ---------------------------------------------------------------------------

-- unaccent: solo se usa aquí, para el backfill de slugs (abajo) -- mismo
-- criterio "if not exists" que ya usa pgcrypto en la migración 000001.
create extension if not exists unaccent;

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  industry text,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  current_plan_id uuid, -- FK real se agrega en 20260916120004 (plans existe ahí)
  billing_email text,
  timezone text not null default 'America/Mexico_City',
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table companies is
  'Empresa cliente de REYMEN Ops (multi-tenant). Cada clients.company_id apunta aquí -- ver backfill en esta misma migración.';

create table branches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  name text not null,
  code text,
  address text,
  timezone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table branches is
  'Sucursal de una company. Opcional en Fase 1 -- una empresa puede no tener ninguna fila aquí todavía y seguir funcionando.';

-- ---------------------------------------------------------------------------
-- Puente con el modelo actual: clients.company_id. Nullable a propósito --
-- así apps/admin/apps/public, que hoy no conocen esta columna, no se rompen.
-- ---------------------------------------------------------------------------
alter table clients add column company_id uuid references companies (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Backfill: una companies por cada client existente (todos, incluidos los
-- soft-deleted -- deleted_at no filtra aquí, es trazabilidad histórica, no
-- una decisión de qué mostrar). Slug generado desde el nombre; en colisión
-- se le agrega un sufijo corto tomado del propio id del client, que es único
-- por definición, así el loop nunca puede entrar en una colisión infinita.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
  base_slug text;
  candidate_slug text;
  new_company_id uuid;
begin
  for r in select id, name, status, created_at, updated_at from clients where company_id is null loop
    base_slug := trim(both '-' from regexp_replace(lower(unaccent(r.name)), '[^a-z0-9]+', '-', 'g'));
    if base_slug = '' then
      base_slug := 'empresa';
    end if;
    candidate_slug := base_slug;
    if exists (select 1 from companies where slug = candidate_slug) then
      candidate_slug := base_slug || '-' || left(replace(r.id::text, '-', ''), 6);
    end if;

    insert into companies (name, slug, status, created_at, updated_at)
    values (
      r.name,
      candidate_slug,
      case when r.status = 'ACTIVE' then 'active' else 'cancelled' end,
      r.created_at,
      r.updated_at
    )
    returning id into new_company_id;

    update clients set company_id = new_company_id where id = r.id;
  end loop;
end $$;
