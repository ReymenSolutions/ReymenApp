-- ---------------------------------------------------------------------------
-- REYMEN Ops -- Fase 1 (Core), migración 4 de 6.
--
-- plans/modules/entitlements (secciones 10-11 del prompt maestro). Precios y
-- módulos v1 tal como están definidos ahí (sección 10): NO se meten los
-- precios "futuros" (sección 10 dice explícitamente no implementarlos aún).
-- retail/care se crean como módulos con active=false -- son los
-- feature-flags *_enabled=false de la sección 11, en forma de fila en vez de
-- constante en código, mismo criterio que el resto de los catálogos de este
-- proyecto.
-- ---------------------------------------------------------------------------

create table plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  price_mxn numeric(10, 2) not null,
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'yearly')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table modules (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true
);

create table plan_modules (
  plan_id uuid not null references plans (id) on delete cascade,
  module_id uuid not null references modules (id) on delete cascade,
  enabled boolean not null default true,
  limits jsonb not null default '{}'::jsonb,
  primary key (plan_id, module_id)
);

create table company_modules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  module_id uuid not null references modules (id) on delete cascade,
  enabled boolean not null default true,
  source text not null default 'plan' check (source in ('plan', 'override', 'beta')),
  limits jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, module_id)
);

comment on table company_modules is
  'Entitlements resueltos de una company -- lo que packages/entitlements lee. source distingue si vino del plan contratado, de un override manual (REYMEN Admin) o de una beta.';

-- Ahora que `plans` existe, se completa el FK que companies.current_plan_id
-- dejó pendiente en 20260916120001.
alter table companies
  add constraint companies_current_plan_id_fkey
  foreign key (current_plan_id) references plans (id);

insert into modules (code, name, description, active) values
  ('smartcard', 'SmartCard', 'Tarjeta digital NFC/QR, perfil público, links y analítica.', true),
  ('realty', 'Realty', 'CRM inmobiliario: leads, propiedades, citas, cierres, Market Pulse.', true),
  ('food', 'Food', 'Operación de restaurante: ventas, inventario, recetas, compras.', true),
  ('retail', 'Retail', 'Vertical futura -- no disponible todavía.', false),
  ('care', 'Care', 'Vertical futura -- no disponible todavía.', false);

insert into plans (code, name, description, price_mxn, billing_period) values
  ('smartcard', 'REYMEN Ops SmartCard', 'Una tarjeta. Todas tus conexiones.', 149.00, 'monthly'),
  ('food', 'REYMEN Ops Food', 'Grandes sabores. Mejores negocios. Incluye SmartCard.', 499.00, 'monthly'),
  ('realty', 'REYMEN Ops Realty', 'Datos para mejores decisiones. Incluye SmartCard.', 599.00, 'monthly');

insert into plan_modules (plan_id, module_id, enabled)
select p.id, m.id, true
from plans p join modules m on (
  (p.code = 'smartcard' and m.code = 'smartcard') or
  (p.code = 'food' and m.code in ('smartcard', 'food')) or
  (p.code = 'realty' and m.code in ('smartcard', 'realty'))
);
