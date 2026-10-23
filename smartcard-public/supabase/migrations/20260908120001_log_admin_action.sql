-- ---------------------------------------------------------------------------
-- log_admin_action (Fase 5): único camino para escribir en audit_logs desde
-- el panel. audit_logs.sql / rls_policies.sql dejaron la tabla sin ninguna
-- policy de INSERT a propósito -- ni siquiera SUPERADMIN puede insertar ahí
-- directo bajo su propia sesión, RLS lo negaría. El mismo patrón que ya usa
-- log_event() para `events` (000013_public_rpc_functions.sql): una función
-- SECURITY DEFINER, dueña de la tabla, hace el INSERT en nombre del usuario
-- autenticado.
--
-- A diferencia de log_event() (pensada para anon), esta función exige que
-- quien la llama tenga una fila activa en admin_profiles -- current_admin_role()
-- ya resuelve exactamente eso.
-- ---------------------------------------------------------------------------

create or replace function log_admin_action(
  p_action text,
  p_entity_type text,
  p_entity_id uuid default null,
  p_before_data jsonb default null,
  p_after_data jsonb default null
) returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if current_admin_role() is null then
    raise exception 'Solo un administrador autenticado puede escribir en audit_logs.';
  end if;

  insert into audit_logs (admin_user_id, action, entity_type, entity_id, before_data, after_data)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, p_before_data, p_after_data);
end;
$$;

revoke all on function log_admin_action(text, text, uuid, jsonb, jsonb) from public;
-- Solo authenticated -- anon nunca tiene fila en admin_profiles, así que la
-- función se lo rechazaría de todas formas, pero no hay razón para
-- concederle ni siquiera el intento.
grant execute on function log_admin_action(text, text, uuid, jsonb, jsonb) to authenticated;
