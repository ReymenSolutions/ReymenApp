-- ---------------------------------------------------------------------------
-- REYMEN Ops -- Fase 1 (Core), migración 6 de 6.
--
-- Mismo criterio que 20260905120012_rls_policies.sql (Fase 2): cero acceso
-- directo para anon; funciones SECURITY DEFINER como única puerta de
-- autorización; grant a anon+authenticated en las funciones para que una
-- consulta directa resuelva 0 filas en vez de reventar con un error interno
-- de permisos al evaluar la policy.
--
-- Dos sistemas de permisos conviven, a propósito separados (ver
-- REYMEN_OPS_PLAN.md sección 5): current_admin_role() ya existe y sigue
-- gobernando admin_profiles/clients/etc. (staff interno de Reymen, vía
-- apps/admin). Las funciones nuevas de aquí (is_company_member,
-- has_company_role, has_permission) gobiernan las tablas nuevas (empresas
-- cliente, vía apps/ops). Un mismo usuario no está pensado para tener fila
-- en admin_profiles Y en company_users a la vez en v1.
-- ---------------------------------------------------------------------------

create or replace function is_company_member(p_company_id uuid)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from company_users
    where company_id = p_company_id and user_id = auth.uid() and status = 'active'
  );
$$;

revoke all on function is_company_member(uuid) from public;
grant execute on function is_company_member(uuid) to anon, authenticated;

create or replace function has_company_role(p_company_id uuid, p_role_codes text[])
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from company_users cu
    join roles r on r.id = cu.role_id
    where cu.company_id = p_company_id
      and cu.user_id = auth.uid()
      and cu.status = 'active'
      and r.code = any (p_role_codes)
  );
$$;

revoke all on function has_company_role(uuid, text[]) from public;
grant execute on function has_company_role(uuid, text[]) to anon, authenticated;

create or replace function has_permission(p_company_id uuid, p_permission_key text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1
    from company_users cu
    join role_permissions rp on rp.role_id = cu.role_id
    join permissions p on p.id = rp.permission_id
    where cu.company_id = p_company_id
      and cu.user_id = auth.uid()
      and cu.status = 'active'
      and p.key = p_permission_key
  );
$$;

revoke all on function has_permission(uuid, text) from public;
grant execute on function has_permission(uuid, text) to anon, authenticated;

-- Cualquier usuario con al menos una fila en company_users (para catálogos
-- de solo lectura, no hace falta que esté 'active' -- alguien todavía
-- 'invited' debe poder ver nombres de rol/plan al aceptar su invitación).
create or replace function is_any_company_user()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (select 1 from company_users where user_id = auth.uid());
$$;

revoke all on function is_any_company_user() from public;
grant execute on function is_any_company_user() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RLS por tabla
-- ---------------------------------------------------------------------------

alter table companies enable row level security;
alter table branches enable row level security;
alter table user_profiles enable row level security;
alter table company_users enable row level security;
alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;
alter table plans enable row level security;
alter table modules enable row level security;
alter table plan_modules enable row level security;
alter table company_modules enable row level security;
alter table subscriptions enable row level security;
alter table payments enable row level security;
alter table billing_webhook_events enable row level security;
-- Sin ninguna policy en billing_webhook_events a propósito: con RLS
-- habilitado y cero policies, ni anon ni authenticated ven u escriben una
-- sola fila -- solo service_role (que ignora RLS) cuando exista el webhook
-- real de Mercado Pago en v1.1.

-- companies: se ve si eres miembro de esa company o staff interno de Reymen.
-- Alta de companies queda reservada a REYMEN Admin en v1 (el modelo sigue
-- siendo "Reymen da de alta a sus clientes", el self-signup es una decisión
-- de producto aparte, fuera de Fase 1). Los dueños/admins de la empresa sí
-- pueden actualizar los datos de su propia company (nombre, billing_email,
-- timezone) -- no su plan ni status, eso lo controla BillingService desde
-- REYMEN Admin.
create policy companies_select on companies for select
  using (is_company_member(id) or current_admin_role() is not null);
create policy companies_insert on companies for insert
  with check (current_admin_role() is not null);
create policy companies_update on companies for update
  using (has_company_role(id, array['owner', 'admin']) or current_admin_role() is not null)
  with check (has_company_role(id, array['owner', 'admin']) or current_admin_role() is not null);

create policy branches_select on branches for select
  using (is_company_member(company_id) or current_admin_role() is not null);
create policy branches_write on branches for all
  using (has_company_role(company_id, array['owner', 'admin']) or current_admin_role() is not null)
  with check (has_company_role(company_id, array['owner', 'admin']) or current_admin_role() is not null);

-- user_profiles: cada quien ve/edita la suya; staff interno puede ver todas
-- (soporte), nunca escribirlas por otra persona.
create policy user_profiles_select on user_profiles for select
  using (id = auth.uid() or current_admin_role() is not null);
create policy user_profiles_write on user_profiles for all
  using (id = auth.uid())
  with check (id = auth.uid());

-- company_users: cualquier miembro activo ve el roster de su empresa (para
-- mostrar "tu equipo"); cada quien ve siempre su propia fila aunque todavía
-- esté 'invited' o quede 'suspended'; solo owner/admin (o staff interno)
-- administra membresías.
create policy company_users_select on company_users for select
  using (
    is_company_member(company_id)
    or user_id = auth.uid()
    or current_admin_role() is not null
  );
create policy company_users_write on company_users for all
  using (has_company_role(company_id, array['owner', 'admin']) or current_admin_role() is not null)
  with check (has_company_role(company_id, array['owner', 'admin']) or current_admin_role() is not null);

-- Catálogos globales (roles/permissions/role_permissions/plans/modules/
-- plan_modules): solo lectura desde la app -- se administran por migración,
-- mismo criterio que themes/destination_types en Fase 2. Legibles por
-- cualquier usuario de una company (activo o no, para no bloquear pantallas
-- de onboarding) o por staff interno.
create policy roles_select on roles for select
  using (is_any_company_user() or current_admin_role() is not null);
create policy permissions_select on permissions for select
  using (is_any_company_user() or current_admin_role() is not null);
create policy role_permissions_select on role_permissions for select
  using (is_any_company_user() or current_admin_role() is not null);
create policy plans_select on plans for select
  using (is_any_company_user() or current_admin_role() is not null);
create policy modules_select on modules for select
  using (is_any_company_user() or current_admin_role() is not null);
create policy plan_modules_select on plan_modules for select
  using (is_any_company_user() or current_admin_role() is not null);

-- company_modules: la empresa ve sus propios entitlements resueltos, pero
-- NUNCA los escribe -- eso lo hace BillingService desde REYMEN Admin
-- (sección 8 de REYMEN_OPS_PLAN.md: no es autoservicio, para no permitir que
-- una empresa se autoactive un módulo que no pagó).
create policy company_modules_select on company_modules for select
  using (is_company_member(company_id) or current_admin_role() is not null);
create policy company_modules_write on company_modules for all
  using (current_admin_role() is not null)
  with check (current_admin_role() is not null);

-- subscriptions/payments: visibles para quien tenga billing.read en su
-- empresa (normalmente owner/admin); escritura reservada a staff interno
-- (BillingService.recordPayment, etc. corren desde REYMEN Admin -- sección 7
-- de REYMEN_OPS_PLAN.md).
create policy subscriptions_select on subscriptions for select
  using (
    (is_company_member(company_id) and has_permission(company_id, 'billing.read'))
    or current_admin_role() is not null
  );
create policy subscriptions_write on subscriptions for all
  using (current_admin_role() is not null)
  with check (current_admin_role() is not null);

create policy payments_select on payments for select
  using (
    (is_company_member(company_id) and has_permission(company_id, 'billing.read'))
    or current_admin_role() is not null
  );
create policy payments_write on payments for all
  using (current_admin_role() is not null)
  with check (current_admin_role() is not null);

-- ---------------------------------------------------------------------------
-- audit_logs: se le agrega company_id (nullable) para poder atribuir
-- acciones futuras de BillingService a una empresa -- no se crea una
-- segunda tabla de auditoría (REYMEN_OPS_PLAN.md sección 3). No se toca la
-- policy de lectura existente (audit_logs_select, SUPERADMIN únicamente):
-- sigue siendo una tabla interna de Reymen, no se expone a company_users en
-- esta fase.
-- ---------------------------------------------------------------------------
alter table audit_logs add column company_id uuid references companies (id) on delete set null;
