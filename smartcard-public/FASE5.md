# REYMEN SmartCard — Fase 5: Gestión de clientes

> Continúa de `AUTH.md` (Fase 4). Este documento cubre el primer módulo real de datos del panel: alta, listado, edición y baja de clientes, más una nueva función SQL para que las acciones administrativas queden registradas en `audit_logs`.

## 1. Qué se construyó

- **Listado de clientes** (`/clients`) -- tabla con búsqueda por nombre, negocio o correo (`?q=...`, sin JavaScript, es un `<form method="get">`), solo clientes no dados de baja.
- **Alta de cliente** (`/clients/new`) -- formulario con los campos que ya definió `DATABASE.md` (`name`, `business_name`, `email`, `phone`, `status`, `notes`). Solo visible/usable para SUPERADMIN y ADMIN.
- **Detalle y edición** (`/clients/[id]`) -- mismo formulario para editar; VIEWER lo ve pero con los campos deshabilitados (sin botón de guardar). También lista, de solo lectura, los perfiles y tarjetas que ya tenga ese cliente (vacío por ahora -- esas pantallas son de fases futuras).
- **Baja de cliente** (soft delete, solo SUPERADMIN) -- pone `deleted_at`, nunca hace `DELETE` físico (`DATABASE.md` sección 4). Un cliente dado de baja se puede **reactivar** desde su misma página de detalle (poniendo `deleted_at` de vuelta en `NULL`), también solo SUPERADMIN.
- **Auditoría real** -- cada alta/edición/baja/reactivación de un cliente queda registrada en `audit_logs`, con el estado anterior y el nuevo cuando aplica (`client.created`, `client.updated`, `client.deleted`, `client.reactivated`).
- **Encabezado compartido** (`components/AdminHeader.tsx`) -- nombre/rol/correo del admin y logout, reutilizado en todas las pantallas autenticadas en vez de repetirlo.

## 2. Por qué una función SQL nueva: `log_admin_action()`

`audit_logs` (Fase 2) se diseñó deliberadamente **sin ninguna policy de `INSERT`** -- ni siquiera SUPERADMIN puede insertar ahí una fila bajo su propia sesión, RLS lo rechaza sin importar el rol. Es la misma idea que ya resolvía `log_event()` para la tabla `events` en Fase 2 (sección 5 de `DATABASE.md`): una función `SECURITY DEFINER`, dueña de la tabla, hace el `INSERT` en nombre de quien la llama.

`supabase/migrations/20260908120001_log_admin_action.sql` agrega justo eso:

```sql
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
```

Reutiliza `current_admin_role()` (Fase 2) para exigir que quien llame tenga una fila activa en `admin_profiles` -- igual de restrictivo que cualquier otra escritura del panel, solo que resuelto una vez dentro de la función en vez de repetido en cada Server Action. Solo se concede `EXECUTE` a `authenticated`, nunca a `anon`.

Del lado de la app, `apps/admin/lib/audit.ts` (`logAdminAction(supabase, {...})`) es el único punto que llama a esta función -- las Server Actions de clientes lo invocan después de cada escritura exitosa. Un fallo al auditar (por ejemplo, si la migración no se aplicó) se registra en consola pero **nunca** tumba la operación real: el cliente ya se guardó cuando se llama a `logAdminAction`.

## 3. Autorización: tres capas, no una

Para cada acción sobre `clients` hay hasta tres verificaciones independientes, cada una por una razón distinta:

1. **RLS en Postgres** (`clients_insert`/`clients_update`/`clients_delete` en `rls_policies.sql`, Fase 2) -- la capa real. Si todo lo demás fallara o se rodeara, esto es lo que de verdad impide que un VIEWER escriba.
2. **La Server Action** (`apps/admin/app/clients/**/actions.ts`) -- revisa `getCurrentAdmin().role` antes de intentar el insert/update, para devolver un error legible (`?error=forbidden`) en vez de dejar que RLS lo rechace con un mensaje interno de Postgres.
3. **La UI** (`page.tsx`) -- oculta el botón "+ Nuevo cliente" y el formulario de edición completo a quien no puede usarlos, y quita el botón "Guardar cambios" para VIEWER.

Las tres existen a propósito: la primera es la que realmente protege los datos; las otras dos son experiencia de usuario, no seguridad -- si se te olvida alguna de esas dos, RLS sigue ahí.

## 4. Qué falta aplicar en tu Supabase local

A diferencia de Fase 4, **aquí no hay que tocar `config.toml`** -- solo aplicar la migración nueva.

```powershell
# 1. Copia supabase/migrations/20260908120001_log_admin_action.sql a tu carpeta
#    supabase/migrations/ (ver sección 6, instrucciones de uso, para el paso a paso completo).

# 2. Desde la raíz del proyecto, reinicia Supabase local para que tome la migración nueva:
npx supabase stop
npx supabase start
```

`supabase start` vuelve a correr todas las migraciones desde cero contra la base de datos local (incluida la nueva), igual que ya pasó en Fase 2 y Fase 4 -- no hace falta ningún paso especial adicional.

## 5. Qué queda fuera de esta fase, a propósito

- **Perfiles y tarjetas** (`/profiles`, `/cards`) -- la página de detalle de cliente ya deja el espacio para listarlos, pero las pantallas para crearlos/editarlos son de fases posteriores. Por ahora esas secciones siempre aparecen vacías.
- **Paginación real** -- el listado de clientes trae todos los resultados que coincidan con la búsqueda, sin límite ni "página siguiente". Aceptable mientras el volumen de clientes sea bajo; si crece, se agrega `range()`/cursor antes de que se vuelva un problema real, no antes.
- **Historial de auditoría visible en el panel** -- `audit_logs` ya se llena, pero todavía no hay una pantalla que lo muestre (sección de "Configuración" o similar, fase futura). Mientras tanto se puede consultar directo por SQL (ver sección 7, validación).
- **Confirmación de "¿seguro que quieres dar de baja?"** -- el botón actúa directo, sin paso intermedio. Se puede agregar un modal de confirmación más adelante si en la práctica hay bajas accidentales; por ahora la baja es reversible (reactivar), así que el costo de un error es bajo.

## 6. Instrucciones de uso: aplicar esta fase en tu máquina

Asumiendo que ya tienes el proyecto en `C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard` y Fase 4 funcionando (puedes iniciar sesión).

### Paso 1 -- Descomprime el zip de esta fase encima del proyecto

Descarga `reymen-smartcard-fase5-clients.zip` y descomprímelo **directamente dentro de** `C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard`, sobrescribiendo cuando te lo pida (son solo archivos nuevos o `apps/admin/app/page.tsx`, que si cambia). En PowerShell, desde la carpeta donde descargaste el zip:

```powershell
Expand-Archive -Path .\reymen-smartcard-fase5-clients.zip -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- Aplica la migración nueva

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npx supabase stop
npx supabase start
```

Confirma en la salida que dice algo como `Applying migration 20260908120001_log_admin_action.sql...` (o que el `start` corre limpio sin errores -- ambos indican que se aplicó).

### Paso 3 -- Arranca el panel

```powershell
npm run dev --workspace=apps/admin
```

### Paso 4 -- Prueba el flujo completo en el navegador

1. Entra a `http://127.0.0.1:3001` e inicia sesión con tu cuenta SUPERADMIN.
2. Da clic en "Ir a Clientes" (o ve directo a `http://127.0.0.1:3001/clients`). Deberías ver los dos clientes del seed (`María Mendoza`, `Cafetería ABC`) si aplicaste `supabase/seed.sql`, o una lista vacía con el enlace "Da de alta el primero" si no.
3. Da clic en "+ Nuevo cliente", llena el nombre (único campo obligatorio) y guarda -- deberías caer en la página de detalle del cliente recién creado.
4. Busca por nombre/negocio/correo desde `/clients` con el cuadro de búsqueda -- prueba con algo que sí exista y algo que no.
5. Entra al detalle de un cliente, cambia algún campo (por ejemplo el estado a "Inactivo") y guarda -- deberías ver "Cambios guardados." y el badge de estado actualizado en el listado.
6. Como SUPERADMIN, da de baja ese cliente ("Dar de baja este cliente") -- debe desaparecer del listado. Entra de nuevo a su URL directa (`/clients/[id]`, cópiala antes de dar de baja) y usa "Reactivar cliente" -- debe volver a aparecer en el listado.

### Paso 5 -- Confirma los tres roles de verdad

Con tu cuenta ADMIN de prueba (la que ya creaste en Fase 4) o invitando una nueva con `--role ADMIN`:

- Debe poder ver el listado, crear y editar clientes.
- El botón "Dar de baja este cliente" **no** debe aparecer en la página de detalle.

Invita también una cuenta `--role VIEWER` (mismo comando de `create-superadmin.mjs`, con `--role VIEWER`) y confirma:

- Ve el listado y el detalle de cualquier cliente.
- No ve el botón "+ Nuevo cliente" en el listado.
- En el detalle, los campos aparecen deshabilitados (fondo gris) y no hay botón "Guardar cambios" ni "Dar de baja".

### Paso 6 -- Confirma que la auditoría sí se está escribiendo

Desde Supabase Studio (`http://127.0.0.1:54323`) → SQL Editor, corre:

```sql
select action, entity_type, entity_id, before_data, after_data, occurred_at
from audit_logs
order by occurred_at desc
limit 10;
```

Deberías ver una fila por cada alta/edición/baja/reactivación que hiciste en el Paso 4 y 5, con `before_data`/`after_data` reflejando el cambio real.

## 7. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/admin` compila sin errores de TypeScript y genera las 3 rutas nuevas (`/clients`, `/clients/new`, `/clients/[id]`) además de las ya existentes de Fase 4.
- La migración `20260908120001_log_admin_action.sql` sigue exactamente el mismo patrón ya probado en Fase 2 para `log_event()` (`SECURITY DEFINER` + `revoke`/`grant` explícitos) -- no se pudo correr contra un Supabase real desde este entorno; pruébalo tú siguiendo la sección 6.
