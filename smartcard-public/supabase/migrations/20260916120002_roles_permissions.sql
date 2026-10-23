-- ---------------------------------------------------------------------------
-- REYMEN Ops -- Fase 1 (Core), migración 2 de 6.
--
-- roles/permissions (sección 9 del prompt maestro). Catálogo global, no por
-- company -- mismo criterio que ya usa `themes`/`destination_types`: tabla,
-- no ENUM, para poder ajustar sin migración. Va ANTES de company_users (que
-- referencia roles) -- por eso el prompt maestro los listaba en el orden
-- contrario, pero aquí se resuelve la dependencia real.
--
-- Matriz de permisos por rol (owner/admin/manager/staff/agent) es una
-- decisión v1 razonable, NO está detallada en el prompt maestro -- queda
-- documentada aquí como tal, ajustable por SQL sin tocar código de app:
--   owner / admin -> todos los permisos (se diferencian más adelante si hace
--                    falta; por ahora ambos administran su empresa completa).
--   manager       -> lectura + gestión del día a día de su vertical, sin
--                    billing.manage ni *.campaigns.manage/*.suppliers.manage.
--   staff         -> solo lectura + las acciones operativas mínimas (marcar
--                    ventas, mover leads de estado) -- sin gestión de
--                    catálogo/precio/proveedores/campañas/billing.
--   agent         -> rol de Realty (sección 9): leads + citas, lectura de
--                    propiedades y mercado -- sin gestión de propiedades,
--                    cierres ni campañas (eso es de manager/owner/admin).
-- ---------------------------------------------------------------------------

create table roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

comment on table roles is
  'Catálogo global de roles dentro de una company (owner/admin/manager/staff/agent). No confundir con admin_profiles.role, que es el rol INTERNO de staff de Reymen en REYMEN Admin.';

create table permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

insert into roles (code, name, description) values
  ('owner', 'Dueño', 'Control total de la empresa, incluyendo billing.'),
  ('admin', 'Administrador', 'Control operativo total de la empresa.'),
  ('manager', 'Gerente', 'Gestión del día a día de su vertical, sin billing.'),
  ('staff', 'Personal', 'Operación diaria con permisos limitados.'),
  ('agent', 'Asesor', 'Rol de Realty: leads y citas propias, lectura de propiedades/mercado.');

insert into permissions (key, description) values
  ('smartcard.read', 'Ver tarjetas y su analítica.'),
  ('smartcard.manage', 'Crear/editar tarjetas y perfiles públicos.'),
  ('smartcard.analytics', 'Ver analítica detallada de SmartCard.'),
  ('realty.leads.read', 'Ver leads.'),
  ('realty.leads.manage', 'Crear/editar/asignar leads.'),
  ('realty.properties.read', 'Ver propiedades.'),
  ('realty.properties.manage', 'Crear/editar propiedades.'),
  ('realty.market.read', 'Ver Market Pulse / demanda.'),
  ('realty.appointments.manage', 'Agendar/editar citas.'),
  ('realty.closings.manage', 'Registrar cierres.'),
  ('realty.campaigns.manage', 'Crear/editar campañas.'),
  ('food.sales.read', 'Ver ventas/pedidos.'),
  ('food.sales.manage', 'Crear/editar pedidos.'),
  ('food.products.manage', 'Crear/editar productos y recetas.'),
  ('food.inventory.read', 'Ver inventario.'),
  ('food.inventory.manage', 'Ajustar inventario.'),
  ('food.purchases.manage', 'Registrar compras.'),
  ('food.suppliers.manage', 'Crear/editar proveedores.'),
  ('food.waste.manage', 'Registrar mermas.'),
  ('food.reports.read', 'Ver reportes.'),
  ('billing.read', 'Ver suscripción y pagos.'),
  ('billing.manage', 'Registrar pagos, cambiar plan, cancelar/reactivar suscripción.');

-- owner y admin: todos los permisos.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p where r.code in ('owner', 'admin');

-- manager: todo excepto billing.manage y las acciones de "catálogo pesado"
-- (proveedores/campañas).
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.code = 'manager'
  and p.key not in ('billing.manage', 'food.suppliers.manage', 'realty.campaigns.manage');

-- staff: solo lectura + las acciones operativas del día a día.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.code = 'staff'
  and p.key in (
    'smartcard.read',
    'realty.leads.read', 'realty.leads.manage', 'realty.appointments.manage',
    'realty.properties.read',
    'food.sales.read', 'food.sales.manage', 'food.inventory.read', 'food.reports.read'
  );

-- agent: leads + citas propias, lectura de propiedades/mercado.
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where r.code = 'agent'
  and p.key in (
    'smartcard.read',
    'realty.leads.read', 'realty.leads.manage',
    'realty.properties.read', 'realty.market.read',
    'realty.appointments.manage'
  );
