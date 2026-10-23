-- ---------------------------------------------------------------------------
-- REYMEN Ops -- Fase 2 (SmartCard autoservicio dentro de apps/ops).
--
-- REYMEN_OPS_PLAN.md (sección 3) dejó cards/profiles/profile_links/events
-- sin tocar a propósito en Fase 1, pendiente de esta fase, que es la que
-- por fin construye la pantalla que los necesita (apps/ops/app/smartcard).
--
-- Igual que el resto del esquema nuevo, se usa el sistema de permisos ya
-- sembrado en 20260916120002_roles_permissions.sql (smartcard.read /
-- smartcard.manage), NO un chequeo de rol hardcodeado -- así owner/admin/
-- manager (que ya tienen smartcard.manage) pueden editar, staff/agent (solo
-- smartcard.read) solo pueden ver, y si algún día se ajusta la matriz de
-- permisos por SQL, esto no necesita tocarse.
--
-- cards/profiles cuelgan de clients, no directo de companies -- por eso los
-- helpers de 20260916120006_core_rls.sql (is_company_member/has_permission,
-- que reciben company_id) no sirven tal cual aquí; se agregan versiones que
-- resuelven company_id indirecto vía clients.company_id.
-- ---------------------------------------------------------------------------

create or replace function has_permission_via_client(p_client_id uuid, p_permission_key text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from clients c
    where c.id = p_client_id
      and c.company_id is not null
      and has_permission(c.company_id, p_permission_key)
  );
$$;

revoke all on function has_permission_via_client(uuid, text) from public;
grant execute on function has_permission_via_client(uuid, text) to anon, authenticated;

create or replace function has_permission_via_profile(p_profile_id uuid, p_permission_key text)
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from profiles p
    where p.id = p_profile_id and has_permission_via_client(p.client_id, p_permission_key)
  );
$$;

revoke all on function has_permission_via_profile(uuid, text) from public;
grant execute on function has_permission_via_profile(uuid, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- cards: lectura con smartcard.read, edición con smartcard.manage. Son
-- policies ADICIONALES -- Postgres combina varias policies permisivas del
-- mismo comando con OR, así que esto no reemplaza las de SUPERADMIN/ADMIN/
-- VIEWER ya existentes (20260905120012_rls_policies.sql), solo las
-- complementa para company_users. Qué columnas puede tocar realmente la
-- edición (solo destination_type/destination_url/profile_id, nunca notes/
-- client_id/status) lo decide la Server Action de apps/ops armando su
-- propio payload explícito -- mismo criterio que ya usa todo este repo
-- (ver apps/admin/app/clients/[id]/actions.ts) -- no un GRANT de columna,
-- porque staff interno y company_users comparten el rol `authenticated` de
-- Postgres y un GRANT de columna no puede distinguir entre ambos.
-- ---------------------------------------------------------------------------
create policy cards_company_select on cards for select
  using (has_permission_via_client(client_id, 'smartcard.read'));

create policy cards_company_update on cards for update
  using (has_permission_via_client(client_id, 'smartcard.manage'))
  with check (has_permission_via_client(client_id, 'smartcard.manage'));

-- profiles (perfil digital de tarjeta pública -- no confundir con
-- user_profiles de Fase 1, que es la cuenta de auth de cada company_user).
create policy profiles_company_select on profiles for select
  using (has_permission_via_client(client_id, 'smartcard.read'));

create policy profiles_company_insert on profiles for insert
  with check (has_permission_via_client(client_id, 'smartcard.manage'));

create policy profiles_company_update on profiles for update
  using (has_permission_via_client(client_id, 'smartcard.manage'))
  with check (has_permission_via_client(client_id, 'smartcard.manage'));

-- profile_links: botones extra del perfil público. Se deja la RLS lista
-- aunque la pantalla de autoservicio de esta fase todavía no los gestiona
-- (los campos fijos de profiles -- whatsapp/instagram/website/etc. -- ya
-- cubren el caso típico) -- así no hace falta otra migración cuando se
-- construya esa pantalla.
create policy profile_links_company_select on profile_links for select
  using (has_permission_via_profile(profile_id, 'smartcard.read'));

create policy profile_links_company_write on profile_links for all
  using (has_permission_via_profile(profile_id, 'smartcard.manage'))
  with check (has_permission_via_profile(profile_id, 'smartcard.manage'));

-- events: solo lectura, para la analítica por tarjeta (tarjetas/eventos
-- totales/promedio de /smartcard). Sin policy de insert -- igual que para
-- el staff interno, los eventos solo se crean vía log_event() (SECURITY
-- DEFINER), nunca por escritura directa de un company_user.
create policy events_company_select on events for select
  using (
    card_id is not null
    and exists (select 1 from cards c where c.id = events.card_id and has_permission_via_client(c.client_id, 'smartcard.read'))
  );

-- destination_types: catálogo de sistema, ya legible para el staff interno
-- (rls_policies.sql); se agrega lectura para cualquier company_user -- lo
-- necesita el <select> de "Destino" en apps/ops/app/smartcard, mismo
-- criterio que ya usa roles/permissions/plans/modules en core_rls.sql
-- (catálogo global, legible por is_any_company_user()).
create policy destination_types_company_select on destination_types for select
  using (is_any_company_user());

-- ---------------------------------------------------------------------------
-- Storage (bucket profile-media, 20260910120001): extiende insert/update a
-- company_users con smartcard.manage sobre SU PROPIO perfil -- el path de
-- cada objeto es `{profileId}/photo` o `{profileId}/logo`
-- (apps/admin/app/profiles/[id]/media-actions.ts), así que
-- storage.foldername(name) da [profileId]. No se toca delete: la pantalla
-- de autoservicio reemplaza (upsert) en vez de borrar; borrar sigue siendo
-- solo SUPERADMIN/ADMIN como hoy.
-- ---------------------------------------------------------------------------
create policy profile_media_company_insert on storage.objects for insert
  with check (
    bucket_id = 'profile-media'
    and has_permission_via_profile((storage.foldername(name))[1]::uuid, 'smartcard.manage')
  );

create policy profile_media_company_update on storage.objects for update
  using (
    bucket_id = 'profile-media'
    and has_permission_via_profile((storage.foldername(name))[1]::uuid, 'smartcard.manage')
  )
  with check (
    bucket_id = 'profile-media'
    and has_permission_via_profile((storage.foldername(name))[1]::uuid, 'smartcard.manage')
  );

-- clients: lectura mínima para que apps/ops pueda resolver su propio
-- client_id (lo necesita para crear un profiles nuevo, que cuelga de
-- client_id, no de company_id directo -- ver REYMEN_OPS_PLAN.md sección 3).
-- Solo lectura, nunca escritura -- los datos del cliente (nombre, notas
-- internas, etc.) se siguen administrando solo desde apps/admin.
create policy clients_company_select on clients for select
  using (company_id is not null and is_company_member(company_id));
