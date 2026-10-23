-- ---------------------------------------------------------------------------
-- Fase 15 (preparar para producción): quinta función pública SECURITY
-- DEFINER, mismo patrón que las cuatro de 20260905120013_public_rpc_functions.sql
-- -- devuelve exactamente los dos campos que necesita `sitemap.ts`
-- (apps/public/app/sitemap.ts), nunca la tabla completa.
--
-- profiles NO tiene ninguna policy de select para `anon` (profiles_select
-- exige SUPERADMIN/ADMIN/VIEWER, ver rls_policies.sql) -- por diseño, desde
-- Fase 2. Sin esta función, un sitemap dinámico tendría que consultar la
-- tabla directamente desde apps/public (rol anon) y RLS simplemente
-- devolvería cero filas, o peor, alguien tendría la tentación de usar
-- service_role en apps/public para "solo esta consulta" -- justo lo que
-- ARCHITECTURE.md prohíbe explícitamente (service_role solo se importa
-- desde código que corre en apps/admin).
-- ---------------------------------------------------------------------------

create or replace function get_public_profile_slugs()
returns table (slug text, updated_at timestamptz)
language sql security definer stable
set search_path = public
as $$
  select p.slug, p.updated_at
  from profiles p
  where p.status = 'ACTIVE'
    and p.is_noindex = false
    and p.deleted_at is null;
$$;

revoke all on function get_public_profile_slugs() from public;
grant execute on function get_public_profile_slugs() to anon, authenticated;
