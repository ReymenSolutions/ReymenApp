-- ---------------------------------------------------------------------------
-- REYMEN Ops -- Bloque 1 de la revisión experta (REYMEN_OPS_REVISION_EXPERTA.md,
-- sección III, punto 1: "Límites de plan aplicados de verdad").
--
-- Hasta esta migración, `plan_modules.limits` / `company_modules.limits`
-- existen como columna jsonb pero nadie los lee ni los hace cumplir --
-- packages/entitlements los expone (Entitlements.limits) solo para que la UI
-- los *muestre*, no hay nada que impida insertar de más. Esta migración
-- agrega la pieza que faltaba: una función que resuelve el límite real de
-- una company, y una policy de RLS que la usa para bloquear el INSERT en
-- company_users cuando ya se llegó al tope.
--
-- Dónde vive el límite: en `company_modules.limits` (NO en
-- `plan_modules.limits` directamente) -- porque `company_modules` es lo que
-- ya existe por company (Fase 1) y lo que packages/entitlements ya lee; una
-- company puede tener un override de límite sin cambiar de plan (igual que
-- `company_modules.source = 'override'` ya permite para módulos completos).
-- `plan_modules.limits` se actualiza también en esta migración -- es la
-- plantilla de valores por defecto que REYMEN Admin debe copiar a
-- `company_modules.limits` cuando activa un módulo para una company (ver
-- Paso 2 de BLOQUE1_PLAN_LIMITS.md); no hay todavía una función que
-- sincronice ambas automáticamente (eso es "asignar/cambiar plan
-- automatizado", parte de otro punto bloqueante de la revisión, no de
-- este).
--
-- "max_team_members" es el único límite real que se hace cumplir en este
-- bloque (es el único caso con una tabla y un flujo de escritura ya
-- existentes -- invitar gente a company_users). Se guarda en el módulo
-- `smartcard` porque todos los planes v1 lo incluyen (sección 10 del prompt
-- maestro) -- es un límite de la EMPRESA, no del módulo, pero no existe hoy
-- una tabla de "límites generales de company" separada de company_modules,
-- y crear una para un solo campo sería sobre-ingeniería para este bloque.
-- `max_smartcards` se dej a como placeholder documentado (ver comentario
-- abajo) para cuando exista la tabla `profiles`/`cards` ligada a company_id
-- (todavía no lo está -- eso es Fase 2 de REYMEN Ops).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. check_limit(): resuelve el límite numérico de una company para una
--    llave dada, mirando SOLO sus company_modules habilitados (fuente de
--    verdad ya usada por packages/entitlements). MAX entre los módulos que
--    la definan (en la práctica solo uno la va a tener) en vez de SUM/AND --
--    si algún día dos módulos definieran la misma llave, quedarse con el
--    más permisivo es más seguro que bloquear por el más restrictivo sin
--    que nadie lo haya decidido explícitamente.
--
--    NULL = sin límite definido = "fail-open" (no bloquea). Es una decisión
--    deliberada: una company sin `limits` configurado (p.ej. una de prueba
--    creada a mano, como en FASE1_OPS_CORE.md paso 5) no debe quedar
--    trabada sin poder invitar a nadie por un olvido de configuración --
--    el límite es una herramienta de negocio (vender upgrades), no una
--    medida de seguridad; la seguridad real (aislamiento entre companies)
--    la siguen dando is_company_member()/has_company_role(), sin cambios.
-- ---------------------------------------------------------------------------
create or replace function check_limit(p_company_id uuid, p_limit_key text)
returns numeric
language sql security definer stable
set search_path = public
as $$
  select max((cm.limits ->> p_limit_key)::numeric)
  from company_modules cm
  where cm.company_id = p_company_id
    and cm.enabled = true
    and cm.limits ? p_limit_key;
$$;

revoke all on function check_limit(uuid, text) from public;
grant execute on function check_limit(uuid, text) to anon, authenticated;

comment on function check_limit(uuid, text) is
  'Límite numérico de una company para una llave (p.ej. max_team_members), leído de company_modules.limits. NULL = sin límite (fail-open). Ver cabecera de 20260916120007_plan_limits.sql.';

-- ---------------------------------------------------------------------------
-- 2. Valores por defecto en plan_modules.limits (plantilla por plan -- ver
--    nota de la cabecera sobre por qué esto no se copia solo a
--    company_modules todavía).
-- ---------------------------------------------------------------------------
update plan_modules pm
set limits = jsonb_set(pm.limits, '{max_team_members}', '2'::jsonb)
from plans p, modules m
where pm.plan_id = p.id and pm.module_id = m.id
  and p.code = 'smartcard' and m.code = 'smartcard';

update plan_modules pm
set limits = jsonb_set(pm.limits, '{max_team_members}', '8'::jsonb)
from plans p, modules m
where pm.plan_id = p.id and pm.module_id = m.id
  and p.code = 'food' and m.code = 'smartcard';

update plan_modules pm
set limits = jsonb_set(pm.limits, '{max_team_members}', '8'::jsonb)
from plans p, modules m
where pm.plan_id = p.id and pm.module_id = m.id
  and p.code = 'realty' and m.code = 'smartcard';

-- ---------------------------------------------------------------------------
-- 3. Backfill de company_modules.limits para companies que YA tienen el
--    módulo smartcard habilitado sin límite configurado (limits = '{}') --
--    para que el bloqueo empiece a aplicar de inmediato en vez de quedar
--    fail-open indefinidamente hasta que alguien lo configure a mano. Solo
--    toca filas con source = 'plan' (las 'override'/'beta' se asume que ya
--    fueron configuradas a propósito por REYMEN Admin) y solo si la company
--    tiene un plan asignado.
-- ---------------------------------------------------------------------------
update company_modules cm
set limits = jsonb_set(cm.limits, '{max_team_members}', to_jsonb((pm.limits ->> 'max_team_members')::numeric))
from companies co, plan_modules pm, modules m
where cm.company_id = co.id
  and cm.module_id = m.id
  and m.code = 'smartcard'
  and pm.plan_id = co.current_plan_id
  and pm.module_id = m.id
  and cm.source = 'plan'
  and not (cm.limits ? 'max_team_members')
  and pm.limits ? 'max_team_members';

-- ---------------------------------------------------------------------------
-- 4. company_users: reemplazar la policy única `company_users_write FOR ALL`
--    por tres granulares. Motivo (no es solo estilo): una policy `FOR ALL`
--    y una policy `FOR INSERT` para la misma tabla/rol se combinan con OR
--    (son "permissive" por default en Postgres) -- si se hubiera agregado
--    una policy de INSERT nueva y más restrictiva DEJANDO también la FOR ALL
--    vieja, la vieja (que no valida límite) habría seguido permitiendo
--    insertar de más, sin error, sin aviso. Por eso el DROP es obligatorio,
--    no opcional.
-- ---------------------------------------------------------------------------
drop policy company_users_write on company_users;

create policy company_users_insert on company_users for insert
with check (
  (has_company_role(company_id, array['owner', 'admin']) or current_admin_role() is not null)
  and (
    -- OJO, verificado con pruebas directas contra Postgres 16 (no es teoría):
    -- el SELECT de abajo NO ve la fila que se está insertando -- usa el
    -- snapshot de antes de que arrancara la sentencia, igual que cualquier
    -- otra subconsulta dentro de un INSERT. Por eso es count(*) < límite
    -- (no <=): si el límite es 2 y ya hay 2 filas (invited/active) ANTES de
    -- este insert, count(*) da 2 y 2 < 2 es falso -> bloquea correctamente
    -- la 3ra. Con <= se hubiera permitido crecer sin límite (se probó y
    -- pasó de largo el tope con <=, se corrigió a < antes de entregar esto).
    (
      select count(*) from company_users cu
      where cu.company_id = company_users.company_id
        and cu.status in ('invited', 'active')
    ) < coalesce(check_limit(company_id, 'max_team_members'), 999999)
  )
);

-- UPDATE y DELETE no repiten el chequeo de límite: cambiar rol/estado de una
-- membresía que YA cuenta contra el límite (o quitarla) nunca puede hacer
-- que se exceda un límite que ya se estaba respetando -- salvo un caso
-- conocido y aceptado como fuera de alcance de este bloque: reactivar a
-- 'active' a alguien 'suspended' no vuelve a validar el límite (ver
-- BLOQUE1_PLAN_LIMITS.md, sección "Qué queda fuera").
create policy company_users_update on company_users for update
using (has_company_role(company_id, array['owner', 'admin']) or current_admin_role() is not null)
with check (has_company_role(company_id, array['owner', 'admin']) or current_admin_role() is not null);

create policy company_users_delete on company_users for delete
using (has_company_role(company_id, array['owner', 'admin']) or current_admin_role() is not null);
