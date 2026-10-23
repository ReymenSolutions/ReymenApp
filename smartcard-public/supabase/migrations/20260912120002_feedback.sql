-- ---------------------------------------------------------------------------
-- feedback (Fase 17): canal para que quien prueba la app -- un cliente real
-- viendo su perfil público, o el equipo interno en el panel -- reporte un
-- problema. Se guarda en una tabla en vez de depender solo de un correo:
-- así queda un registro consultable sin importar si Resend está funcionando
-- en ese momento (Fase 15/16 ya tuvieron una falla real de correo saliente
-- que costó días diagnosticar -- no depender de ese canal para algo tan
-- básico como "¿alguien reportó algo?" es deliberado).
--
-- Mismo criterio de privacidad que `events` (Fase 2/15): sin columna de IP.
-- `contact_email` es opcional y lo escribe la propia persona que reporta,
-- nunca se infiere de la sesión ni de la petición.
-- ---------------------------------------------------------------------------
create table feedback (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('public_profile', 'admin_panel')),
  message text not null check (char_length(message) between 1 and 2000),
  contact_email text,
  profile_id uuid references profiles (id) on delete set null,
  admin_id uuid references admin_profiles (id) on delete set null,
  page_url text,
  created_at timestamptz not null default now()
);

comment on table feedback is
  'Reportes de problemas de quien prueba la app (Fase 17). Sin columna de IP -- mismo criterio de privacidad que events.';
comment on column feedback.admin_id is
  'Quién lo reportó si vino autenticado desde el panel (source=admin_panel). Null en un reporte de source=public_profile -- ahí no hay sesión de ningún tipo.';

alter table feedback enable row level security;

-- Lectura para el equipo, igual que events (sección 19: VIEWER también
-- consulta analítica/reportes). Sin policy de INSERT: se escribe solo a
-- través de submit_feedback() (SECURITY DEFINER), mismo patrón que
-- log_event()/log_admin_action() -- ni anon ni un admin autenticado tienen
-- privilegio directo de INSERT sobre esta tabla.
create policy feedback_select on feedback for select
  using (current_admin_role() in ('SUPERADMIN', 'ADMIN', 'VIEWER'));

-- Único camino para escribir en feedback, desde cualquiera de los dos apps.
-- A diferencia de log_event() (solo anon) y log_admin_action() (solo
-- authenticated con fila en admin_profiles), esta se otorga a ambos roles
-- porque el mismo formulario de "reportar un problema" existe en los dos
-- lados (apps/public sin sesión, apps/admin con sesión) -- el source que
-- manda quien llama es el que distingue de cuál vino, no el rol de
-- Postgres.
create or replace function submit_feedback(
  p_source text,
  p_message text,
  p_contact_email text default null,
  p_profile_slug text default null,
  p_page_url text default null
) returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_admin_id uuid;
begin
  if p_source not in ('public_profile', 'admin_panel') then
    raise exception 'source inválido: %', p_source;
  end if;

  if p_message is null or char_length(trim(p_message)) = 0 then
    raise exception 'El mensaje no puede estar vacío.';
  end if;

  if p_profile_slug is not null then
    select id into v_profile_id from profiles where slug = p_profile_slug and deleted_at is null;
  end if;

  -- Si quien llama tiene sesión de Supabase Auth y fila activa en
  -- admin_profiles, se guarda quién fue -- current_admin_role() ya resuelve
  -- exactamente esa comprobación. anon nunca tiene una, así que aquí queda
  -- en null sin necesitar una rama aparte.
  if current_admin_role() is not null then
    v_admin_id := auth.uid();
  end if;

  insert into feedback (source, message, contact_email, profile_id, admin_id, page_url)
  values (
    p_source,
    left(trim(p_message), 2000),
    nullif(trim(coalesce(p_contact_email, '')), ''),
    v_profile_id,
    v_admin_id,
    left(p_page_url, 500)
  );
end;
$$;

revoke all on function submit_feedback(text, text, text, text, text) from public;
grant execute on function submit_feedback(text, text, text, text, text) to anon, authenticated;
