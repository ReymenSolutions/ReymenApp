-- ---------------------------------------------------------------------------
-- Autorización real (sección 19-20): el backend (Postgres vía RLS) es quien
-- decide, no solo el frontend ocultando botones.
--
-- Estrategia:
--  1. Ninguna tabla concede acceso directo al rol `anon`. Cero policies para
--     anon en este archivo, en ninguna tabla. Sin policy, RLS deniega por
--     defecto: anon queda sin ver ni escribir una sola fila directamente.
--  2. El único acceso público pasa por 4 funciones SECURITY DEFINER
--     (000013_public_rpc_functions.sql) que actúan como DTOs explícitos a
--     nivel de base de datos — la respuesta a la sección 99 ("no SELECT *
--     indiscriminado en APIs públicas"), no solo una convención de código.
--  3. El rol `authenticated` (usuarios del panel admin) se autoriza por rol
--     de negocio (SUPERADMIN/ADMIN/VIEWER) guardado en admin_profiles, leído
--     a través de current_admin_role().
-- ---------------------------------------------------------------------------

create or replace function current_admin_role()
returns text
language sql security definer stable
set search_path = public
as $$
  select role from admin_profiles where id = auth.uid() and is_active = true;
$$;

revoke all on function current_admin_role() from public;
-- Se otorga también a anon (no solo a authenticated): aunque anon nunca
-- tiene fila en admin_profiles y por tanto current_admin_role() siempre le
-- devuelve NULL, sin este GRANT una tabla con RLS habilitado responde con un
-- error interno de permisos al evaluar la policy en vez de simplemente no
-- devolver filas. Con el GRANT, una consulta directa de anon contra
-- cualquier tabla protegida (algo que nunca debería pasar si todo pasa por
-- las funciones de 000013, pero que debe fallar de forma predecible si
-- ocurre) se resuelve en 0 filas, no en un error de Postgres expuesto al
-- cliente.
grant execute on function current_admin_role() to anon, authenticated;

alter table admin_profiles enable row level security;
alter table clients enable row level security;
alter table themes enable row level security;
alter table profiles enable row level security;
alter table profile_links enable row level security;
alter table cards enable row level security;
alter table events enable row level security;
alter table audit_logs enable row level security;
alter table destination_types enable row level security;
alter table reserved_slugs enable row level security;

-- admin_profiles: cada quien ve su propia fila; SUPERADMIN ve y administra todas.
create policy admin_profiles_select on admin_profiles
  for select using (id = auth.uid() or current_admin_role() = 'SUPERADMIN');

create policy admin_profiles_write on admin_profiles
  for all using (current_admin_role() = 'SUPERADMIN')
  with check (current_admin_role() = 'SUPERADMIN');

-- clients: lectura para los 3 roles; alta/edición SUPERADMIN+ADMIN; baja solo SUPERADMIN.
create policy clients_select on clients for select
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN', 'VIEWER'));
create policy clients_insert on clients for insert
  with check (current_admin_role() in ('SUPERADMIN', 'ADMIN'));
create policy clients_update on clients for update
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN'))
  with check (current_admin_role() in ('SUPERADMIN', 'ADMIN'));
create policy clients_delete on clients for delete
  using (current_admin_role() = 'SUPERADMIN');

-- profiles: mismo patrón que clients.
create policy profiles_select on profiles for select
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN', 'VIEWER'));
create policy profiles_insert on profiles for insert
  with check (current_admin_role() in ('SUPERADMIN', 'ADMIN'));
create policy profiles_update on profiles for update
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN'))
  with check (current_admin_role() in ('SUPERADMIN', 'ADMIN'));
create policy profiles_delete on profiles for delete
  using (current_admin_role() = 'SUPERADMIN');

-- profile_links: SUPERADMIN+ADMIN pueden gestionar (crear/editar/desactivar/eliminar), VIEWER solo lee.
create policy profile_links_select on profile_links for select
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN', 'VIEWER'));
create policy profile_links_insert on profile_links for insert
  with check (current_admin_role() in ('SUPERADMIN', 'ADMIN'));
create policy profile_links_update on profile_links for update
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN'))
  with check (current_admin_role() in ('SUPERADMIN', 'ADMIN'));
create policy profile_links_delete on profile_links for delete
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN'));

-- cards: mismo patrón que clients/profiles.
create policy cards_select on cards for select
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN', 'VIEWER'));
create policy cards_insert on cards for insert
  with check (current_admin_role() in ('SUPERADMIN', 'ADMIN'));
create policy cards_update on cards for update
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN'))
  with check (current_admin_role() in ('SUPERADMIN', 'ADMIN'));
create policy cards_delete on cards for delete
  using (current_admin_role() = 'SUPERADMIN');

-- themes: catálogo de diseño. Gestión (crear/editar/borrar) reservada a
-- SUPERADMIN por ahora (ver respuesta sobre "diseño especial" de cliente);
-- los 3 roles pueden leerlos para asignarlos a un perfil.
create policy themes_select on themes for select
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN', 'VIEWER'));
create policy themes_write on themes for all
  using (current_admin_role() = 'SUPERADMIN')
  with check (current_admin_role() = 'SUPERADMIN');

-- destination_types / reserved_slugs: catálogos de sistema, lectura para el
-- panel, escritura reservada a SUPERADMIN (cambia poco y con cuidado).
create policy destination_types_select on destination_types for select
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN', 'VIEWER'));
create policy destination_types_write on destination_types for all
  using (current_admin_role() = 'SUPERADMIN')
  with check (current_admin_role() = 'SUPERADMIN');

create policy reserved_slugs_select on reserved_slugs for select
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN', 'VIEWER'));
create policy reserved_slugs_write on reserved_slugs for all
  using (current_admin_role() = 'SUPERADMIN')
  with check (current_admin_role() = 'SUPERADMIN');

-- events: analítica de solo lectura para los 3 roles (sección 19: VIEWER
-- también consulta analytics). Deliberadamente sin policy de INSERT: los
-- registros solo se crean a través de log_event() (000013), una función
-- SECURITY DEFINER que hace el INSERT como dueña de la tabla, sin necesitar
-- que anon tenga privilegio directo sobre events.
create policy events_select on events for select
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN', 'VIEWER'));

-- audit_logs: inmutable y de lectura restringida a SUPERADMIN. Sin policies
-- de INSERT/UPDATE/DELETE: se escribe desde funciones de servidor con el
-- mismo mecanismo SECURITY DEFINER, nunca por policy abierta a un rol.
create policy audit_logs_select on audit_logs for select
  using (current_admin_role() = 'SUPERADMIN');
