-- ---------------------------------------------------------------------------
-- REYMEN Ops -- Fase 1 (Core), migración 5 de 6.
--
-- subscriptions/payments (secciones 12-13 del prompt maestro): billing v1.0
-- manual. billing_webhook_events (sección 14) se crea vacía, sin usarse --
-- preparación de v1.1 (Mercado Pago), no debe tocarse desde código todavía.
-- ---------------------------------------------------------------------------

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  plan_id uuid not null references plans (id),
  provider text not null default 'manual' check (provider in ('manual', 'mercadopago', 'stripe', 'other')),
  provider_subscription_id text,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_company_id_idx on subscriptions (company_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies (id) on delete cascade,
  subscription_id uuid references subscriptions (id) on delete set null,
  provider text not null default 'manual' check (provider in ('manual', 'mercadopago', 'stripe', 'other')),
  provider_payment_id text,
  payment_method text not null check (payment_method in ('transfer', 'cash', 'bank_deposit', 'other')),
  amount numeric(10, 2) not null,
  currency text not null default 'MXN',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  paid_at timestamptz,
  due_at timestamptz,
  reference text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references admin_profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column payments.created_by is
  'Quién registró el pago -- siempre un admin_profiles (staff interno de Reymen, vía REYMEN Admin), nunca el propio cliente: el flujo v1 es "cliente paga manualmente -> Reymen verifica -> Reymen registra" (sección 13).';

create index payments_company_id_idx on payments (company_id);

-- Preparación v1.1 (sección 14) -- no se usa todavía, ninguna app la lee ni
-- la escribe en Fase 1. Sin RLS habilitado a propósito: solo el service_role
-- (que ignora RLS) debería tocarla cuando exista el webhook real.
create table billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  external_event_id text not null unique,
  type text not null,
  payload jsonb not null,
  status text not null default 'received',
  processed_at timestamptz,
  created_at timestamptz not null default now()
);
