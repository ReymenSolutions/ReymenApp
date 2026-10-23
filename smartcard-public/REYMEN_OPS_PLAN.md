# REYMEN Ops — Plan de arquitectura (respuesta previa a codificar)

> Pedido explícito del prompt maestro (sección 120): antes de escribir código, entregar
> resumen de arquitectura, estructura de carpetas, plan de esquema Supabase, plan de
> migración de Fase 1, estrategia de RLS, de Auth, de BillingService, de Entitlements,
> de navegación, de CI/GitHub, lista de riesgos y checklist de aceptación de Fase 1.
> Decisiones ya confirmadas contigo: **evolucionamos `reymen-smartcard`** (no repo nuevo)
> y **sin GitHub todavía** (seguimos con el flujo scp + docker compose al VPS).

---

## 1. Resumen de arquitectura

REYMEN Ops es la evolución de `reymen-smartcard` de un modelo **de un solo tenant,
operado por el staff de Reymen** (hoy: Reymen crea y edita el perfil de cada cliente
desde `apps/admin`; el cliente nunca inicia sesión) a un modelo **multi-tenant
autoservicio** (cada empresa cliente tiene sus propios usuarios, que entran a su propio
panel y administran su SmartCard/Realty/Food ellos mismos).

Eso implica una pieza nueva que hoy NO existe: un tercer app. Los mockups que
compartiste (Dashboard "REYMEN Ops Realty", "REYMEN Ops Food", login con
correo/Google/Apple, sidebar Dashboard/SmartCard/Leads/Propiedades/...) son ESE app
nuevo, no `apps/admin` tal como está hoy.

Topología resultante — **tres apps**, un solo backend Supabase:

```
apps/
  admin/   -- YA EXISTE. Se convierte en "REYMEN Admin" (sección 74-81 del prompt
             maestro): panel INTERNO de Reymen Solutions -- superadmin/operations/
             finance/support -- que ve y administra TODAS las empresas clientes,
             sus planes, pagos, módulos y salud. Es, con ajustes, lo que ya
             construimos en Fases 1-17 (gestión de clientes/tarjetas/perfiles,
             analítica, feedback) -- se reutiliza casi todo.
  ops/     -- NUEVO. El SaaS autoservicio: aquí entran los USUARIOS DE CADA EMPRESA
             CLIENTE (owner/admin/manager/staff/agent) a administrar su propio
             SmartCard, y -- cuando avancemos a Fase 3/4 -- sus leads/propiedades
             (Realty) o su inventario/pedidos (Food). Esto es lo que muestran los
             8 mockups: login, dashboard, "Mis SmartCards", Realty dashboard, Food
             dashboard/mobile.
  public/  -- YA EXISTE. Landing pública sin login: perfiles de tarjeta (/[slug],
             a futuro /p/[slug] de propiedad, /m/[slug] de menú), redirecciones de
             NFC/QR (/n, /q), tracking de clics (/c, /l). Se mantiene tal cual,
             solo se le van agregando rutas por vertical.
```

Todo comparte `packages/database` (cliente Supabase + tipos) y `packages/lib`
(helpers sin estado: contraste, iconos, QR, vCard, detección de bots, tokens de tema)
-- exactamente el mismo patrón de monorepo npm workspaces que ya usamos, solo se le
agrega el workspace `apps/ops`.

**Por qué reutilizar en vez de reescribir:** el patrón de RLS con funciones
`SECURITY DEFINER`, el patrón de auditoría (`audit_logs`/`logAdminAction`), el patrón
de analítica (`events` + `log_event()`), el patrón de subida de medios, y sobre todo
el pipeline de deploy (scp → ssh → tar → `docker compose up -d --build`) ya están
probados en producción. Fase 1 los extiende, no los tira.

---

## 2. Estructura de carpetas (destino)

```
reymen-smartcard/                  -- el nombre del proyecto se queda igual;
                                       renombrarlo es puramente cosmético y no aporta
  apps/
    admin/                         -- REYMEN Admin (interno) -- ya existe
    ops/                           -- NUEVO -- self-serve SaaS
      app/
        (auth)/login/
        (auth)/forgot-password/
        dashboard/                 -- home por vertical, condicionado a entitlements
        smartcard/
        realty/                   -- Fase 3
        food/                     -- Fase 4
        settings/
        layout.tsx                -- valida sesión + company_id activo
      components/
      lib/
    public/                        -- ya existe
  packages/
    database/                      -- ya existe, se le agregan tipos de las tablas
                                       nuevas (companies, branches, plans, ...)
    lib/                            -- ya existe
    entitlements/                  -- NUEVO, paquete chico: resolveEntitlements(),
                                       hasModule(), hasPermission() -- compartido
                                       por admin y ops
  supabase/
    migrations/                    -- ya existe, se le agregan las de Fase 1 (abajo)
    seed.sql                       -- NUEVO -- reemplaza los scripts sueltos que
                                       había (create-superadmin.mjs se queda para
                                       el superadmin interno de REYMEN Admin)
  docs/                             -- NUEVO -- ahí migran ARCHITECTURE.md, DATABASE.md,
                                       AUTH.md tal cual existen, más los nuevos
                                       (BILLING.md, SECURITY.md ya implícitos en
                                       AUTH.md/DATABASE.md, se separan si crecen)
  infra/                           -- ya existe (docker-compose.yml del VPS)
```

No se toca nada dentro de `apps/admin/app/*` ni `apps/public/app/*` en Fase 1 más
allá de lo estrictamente necesario para que sigan funcionando sobre el esquema nuevo
(ver sección 4) -- Fase 1 es fundación, no refactor visual.

---

## 3. Plan de esquema Supabase (Fase 1 — Core)

Regla de migración: **no se borra ni se renombra nada de lo que ya existe todavía.**
`clients`, `profiles`, `cards`, `events`, etc. se quedan funcionando exactamente
igual para `apps/admin` y `apps/public` mientras se agrega el esquema nuevo al lado.
El acoplamiento entre ambos mundos se hace con una sola columna (`clients.company_id`,
nullable al inicio) -- no con una migración de datos destructiva de una sola vez.

Tablas nuevas de Fase 1 (mapeadas 1:1 contra las secciones 5, 6, 9, 10, 11, 12 del
prompt maestro):

- `companies` -- una fila por empresa cliente. **Migración de datos**: cada fila de
  `clients` hoy existente genera una `company` (mismo `name`), y se llena
  `clients.company_id` apuntando a ella -- así `apps/admin` (que sigue leyendo
  `clients`) no se rompe, y ya queda todo trazable hacia el modelo nuevo.
- `branches` -- opcional en Fase 1 (una empresa puede no tener sucursales todavía);
  se crea la tabla pero no es obligatorio poblarla.
- `profiles` (tabla de Auth, `full_name`/`avatar_url`/`phone`) -- **choque de nombre**
  con la `profiles` que ya existe (perfiles de tarjeta pública). Se resuelve
  renombrando la tabla nueva a `user_profiles` -- incompatibilidad menor con el
  prompt maestro, documentada aquí, no silenciosa.
- `company_users` -- usuario ↔ empresa ↔ rol ↔ sucursal (nullable). Esta es la tabla
  que hoy NO existe en ninguna forma -- es el corazón del self-serve.
- `roles` / `permissions` / `role_permissions` -- catálogo, igual que `themes` o
  `destination_types` hoy (catálogo en tabla, no ENUM, mismo criterio ya usado).
- `plans`, `modules`, `plan_modules`, `company_modules` -- igual que el prompt
  maestro secciones 10-11, sin cambios.
- `subscriptions`, `payments` -- billing manual, secciones 12-13, sin Mercado Pago.
- `billing_webhook_events` -- se crea vacía, sin usarse (preparación v1.1, sección 14).
- `notifications`, `audit_logs` (evolucionar la existente para admitir `company_id`
  nullable en vez de crear una segunda tabla de auditoría).

Tablas que NO se tocan en Fase 1: `profiles` (tarjeta pública), `profile_links`,
`cards`, `events`, `themes`, `feedback`, `admin_profiles` (se queda siendo el
catálogo de USUARIOS INTERNOS de Reymen para `apps/admin` -- no se confunde con
`company_users`, que son usuarios de las empresas cliente).

---

## 4. Plan de migración de Fase 1 (archivos concretos)

Seis migraciones nuevas, mismo estilo que las 20 que ya existen (numeradas por
fecha, un archivo por responsabilidad, comentario explicando el porqué):

1. `20260916120001_companies_and_branches.sql` -- crea `companies`, `branches`;
   agrega `clients.company_id uuid references companies(id)`, nullable; backfill:
   `insert into companies (...) select ... from clients` + `update clients set
   company_id = ...`.
2. `20260916120002_user_profiles_and_company_users.sql` -- crea `user_profiles`
   (ligada a `auth.users`), `company_users`.
3. `20260916120003_roles_permissions.sql` -- crea `roles`, `permissions`,
   `role_permissions`; seed de los roles/permisos listados en la sección 9 del
   prompt maestro (`owner`, `admin`, `manager`, `staff`, `agent`; permisos
   `smartcard.*`, `realty.*`, `food.*`, `billing.*`).
4. `20260916120004_plans_modules_entitlements.sql` -- crea `plans`, `modules`,
   `plan_modules`, `company_modules`; seed de los 3 planes v1 (SmartCard $149,
   Food $499, Realty $599) y los 3 módulos v1.
5. `20260916120005_billing_manual.sql` -- crea `subscriptions`, `payments`,
   `billing_webhook_events` (vacía).
6. `20260916120006_core_rls.sql` -- helpers `is_company_member()`,
   `has_company_role()`, `has_permission()` + políticas RLS de las 8 tablas nuevas
   (ver sección 5).

Cada una se prueba localmente contra Postgres antes de mandarla al VPS, con el
mismo criterio que ya se siguió en `DATABASE.md` sección 8 ("Cómo se validó esto").

---

## 5. Estrategia de RLS

Se replica el patrón que ya funciona en `rls_policies.sql` (Fase 2): nada de
`GRANT` directo a `anon`/`authenticated` sobre las tablas de negocio; todo pasa por
policies que llaman helpers `SECURITY DEFINER`.

```sql
create function is_company_member(p_company_id uuid) returns boolean
  language sql security definer set search_path = public as $$
  select exists (
    select 1 from company_users
    where company_id = p_company_id and user_id = auth.uid() and status = 'active'
  );
$$;

create function has_company_role(p_company_id uuid, p_roles text[]) returns boolean ...
create function has_permission(p_company_id uuid, p_permission_key text) returns boolean ...
```

Regla dura del prompt maestro (sección 89, QA multi-tenant): toda tabla con
`company_id` lleva una policy que filtra por `is_company_member(company_id)` como
mínimo, y las acciones de escritura sensibles (borrar propiedad, cancelar
suscripción, etc.) además exigen `has_permission(...)`. Esto se prueba
directamente contra RLS (no solo desde la UI) antes de dar Fase 1 por cerrada --
igual que se hizo con `admin_profiles` en Fase 2.

`apps/admin` (REYMEN Admin, interno) sigue usando su propio mecanismo actual
(`admin_profiles.role` + `current_admin_role()`) -- **no** pasa por
`company_users`/`has_permission()`, porque el staff de Reymen no es "miembro" de
las empresas cliente, las administra desde afuera. Es un segundo sistema de
permisos, deliberadamente separado, ya construido y probado.

---

## 6. Estrategia de Auth

Se sigue usando Supabase Auth (ya en producción, `AUTH.md`), sin cambios en cómo
se maneja la sesión (`createServerSupabaseClient`, middleware). Lo que cambia es
qué determina qué ve un usuario después de loguearse:

- **Un usuario de `admin_profiles`** (staff interno Reymen) → entra a `apps/admin`
  → ve TODAS las empresas, como hoy.
- **Un usuario de `company_users`** (empleado de una empresa cliente) → entra a
  `apps/ops` → su sesión se resuelve a 1+ `company_id` (la mayoría tendrá una sola
  empresa; se deja la puerta abierta a más de una por si en el futuro una persona
  trabaja para dos negocios) → todo lo que ve dentro de `apps/ops` se filtra por
  ese `company_id`, reforzado por RLS, nunca solo por UI.
- Un mismo correo NO está pensado para tener ambos roles a la vez en v1 -- si
  algún día el staff de Reymen necesita "impersonar" una empresa para soporte, eso
  es un mecanismo aparte (fuera de alcance de Fase 1, se anota como idea futura).

Invitaciones: `company_users` se crea vía invitación (Supabase Auth admin API,
mismo patrón que ya existe para invitar admins internos -- se generaliza esa
función en vez de escribir una nueva desde cero).

---

## 7. Estrategia de BillingService

Capa de abstracción nueva en `packages/database` (o un paquete chico
`packages/billing` si crece), llamada exactamente como en el prompt maestro:

```
BillingService
├── ManualBillingProvider   -- Fase 1, la única activa
└── MercadoPagoProvider     -- placeholder v1.1, sin credenciales ni lógica real
```

Operaciones (`recordPayment`, `renewSubscription`, `changePlan`,
`suspendSubscription`, `reactivateSubscription`, `cancelSubscription`,
`getSubscriptionStatus`) se implementan como funciones de servidor que:
1. validan permiso (`has_permission(company_id, 'billing.manage')` o rol interno
   de REYMEN Admin, según desde qué app se llamen -- `recordPayment` normalmente
   se dispara desde REYMEN Admin, no desde `apps/ops`);
2. escriben en `payments`/`subscriptions`;
3. actualizan `company_modules` según el plan resultante;
4. quedan en `audit_logs` (mismo `logAdminAction` ya existente, generalizado para
   aceptar `company_id`).

Flujo v1 idéntico al descrito en la sección 13 del prompt maestro: pago manual →
Reymen verifica → admin interno registra el pago desde REYMEN Admin → entitlements
se actualizan automáticamente. No se borra histórico en downgrade/suspensión/
cancelación (regla explícita, ya es el mismo criterio que usamos con soft-delete
en `clients`/`profiles`).

---

## 8. Estrategia de Entitlements

`packages/entitlements` (nuevo, sin estado, puro TypeScript + una función que
consulta Supabase):

```ts
resolveEntitlements(supabase, companyId): Promise<{ modules: Set<ModuleCode>, limits: Record<string, unknown> }>
hasModule(entitlements, module: 'smartcard' | 'realty' | 'food'): boolean
hasPermission(entitlements, permissionKey: string): boolean   // combina con roles
```

Se resuelve UNA vez por request en el layout de `apps/ops` (server component) y se
pasa hacia abajo -- no se re-consulta en cada página. La navegación de `apps/ops`
(sección 9) se arma filtrando por `hasModule(...)`, y cada RUTA además revalida el
entitlement server-side (no basta con esconder el link, sección 9/89 del prompt
maestro: "no usar solo navegación oculta como seguridad").

QA de aceptación explícita (sección 90 del prompt maestro, ya en el checklist de
abajo): una empresa con plan SmartCard no debe poder ver Food ni Realty ni
navegando la URL directamente.

---

## 9. Estrategia de navegación

`apps/ops` arma su sidebar/bottom-nav dinámicamente según `entitlements.modules`:

- Solo SmartCard habilitado → nav mínima (Dashboard, SmartCard, Configuración),
  como el mockup del "Panel SmartCard-only" (sección 20 del prompt maestro).
- Food habilitado → agrega Ventas, Pedidos, Productos, Inventario, Recetas,
  Compras, Reportes (mockups "Ops Food").
- Realty habilitado → agrega Leads, Propiedades, Clientes, Seguimientos, Agenda,
  Reportes (mockup "Ops Realty").
- Food y Realty siempre incluyen SmartCard (ya viene incluido en esos dos planes).

`apps/admin` (REYMEN Admin) no cambia su navegación en Fase 1 -- eso es Fase 2.

---

## 10. Estrategia de CI/GitHub

**Diferida, según lo que confirmaste.** Documentado aquí para no perderlo:

- Cuando exista el repo, `docs/GITHUB_WORKFLOW.md` describe branching
  (`main` + `feature/*`), convención de commits, y PRs obligatorios para cambios
  importantes -- tal como pide el prompt maestro secciones 100-105.
- `.github/workflows/ci.yml` (lint, typecheck, tests, build) se agrega en ese
  momento; mientras tanto, cada fase de este proyecto ya pasa por
  `npx tsc --noEmit` y `npm run build:*` antes de entregarse (mismo criterio que
  ya veníamos siguiendo en Fases 14-17).
- El pipeline de deploy real (VPS + docker compose) sigue siendo el mecanismo de
  producción -- eso no depende de tener GitHub, y no se toca.

---

## 11. Riesgos

1. **Choque de nombre `profiles`**: la tabla de Auth del prompt maestro se llama
   `profiles`, pero ya existe una `profiles` (perfil de tarjeta pública) en
   producción. Mitigado renombrando la nueva a `user_profiles` -- documentado
   arriba, no es un riesgo activo si se sigue este plan, pero hay que tenerlo
   presente al copiar SQL directamente del prompt maestro.
2. **Pivote de producto real**: pasar de "Reymen administra todo por el cliente"
   a "el cliente administra su propio negocio" es un cambio de producto, no solo
   técnico -- afecta cómo se vende, se onboardea y se da soporte. Vale la pena
   confirmarlo una vez más contigo cuando `apps/ops` esté listo para probarse,
   antes de invitar clientes reales.
3. **Alcance de una semana es optimista.** El plan de ejecución del prompt
   maestro (sección 118) asume "sprint turbo" de 7 días para las 4 fases
   completas. Con el alcance real (RLS multi-tenant + 3 verticales + billing +
   admin + n8n + QA) es razonable que tome más, sobre todo porque cada fase debe
   quedar probada antes de avanzar (mismo estándar que ya aplicamos en
   Fases 1-17). Se avisará si algún corte de fase se atrasa en vez de entregar
   algo sin probar.
4. **Doble sistema de permisos** (staff interno vía `admin_profiles` vs. empresas
   vía `company_users`) es la elección correcta para este caso, pero significa
   mantener dos superficies de RLS en paralelo -- se documentará claramente cuál
   aplica a cada tabla para no mezclarlas por error.
5. **`n8n`**: el prompt maestro asume automatizaciones ya definidas (bienvenida,
   confirmación de pago, recordatorio de vencimiento, stock bajo). No sabemos
   todavía si ya existe una instancia de n8n corriendo para Reymen o si hay que
   levantarla -- se resuelve cuando lleguemos a esa parte de Fase 1/4, no bloquea
   el resto.

---

## 12. Checklist de aceptación — Fase 1 (Core)

- [ ] `companies`/`branches` creadas; cada `clients` existente tiene su
      `company_id` poblado sin perder datos.
- [ ] `user_profiles`, `company_users`, `roles`, `permissions`,
      `role_permissions` creadas y sembradas.
- [ ] `plans`, `modules`, `plan_modules`, `company_modules` creadas y sembradas
      con los 3 planes/módulos v1.
- [ ] `subscriptions`, `payments`, `billing_webhook_events` creadas (la última,
      vacía y sin usarse todavía).
- [ ] RLS: helpers `is_company_member`, `has_company_role`, `has_permission`
      probados directamente contra la base (una empresa no puede leer/escribir
      datos de otra -- sección 89 del prompt maestro).
- [ ] BillingService (`ManualBillingProvider`) funcional: registrar pago activa
      suscripción y habilita módulos; suspender/cancelar no borra histórico.
- [ ] `apps/ops` existe como workspace nuevo: login funcional (Supabase Auth),
      layout que resuelve `company_id` + entitlements, navegación condicionada
      por módulo, un dashboard mínimo por empresa (aunque sea solo el de
      SmartCard, reutilizando datos que ya existen vía `company_id` en
      `clients`).
- [ ] `apps/admin` y `apps/public` siguen funcionando exactamente igual que hoy
      (ningún cambio de comportamiento visible para el staff de Reymen ni para
      los visitantes de tarjetas públicas).
- [ ] `npx tsc --noEmit` limpio y `npm run build:*` exitoso en los tres apps.
- [ ] Deploy probado en el VPS con el flujo actual (scp + tar + docker compose).

Cuando este checklist esté completo, seguimos con Fase 2 del prompt maestro
(SmartCard dentro de `apps/ops` a nivel funcional completo + REYMEN Admin con
suscripciones/pagos/planes/salud).
