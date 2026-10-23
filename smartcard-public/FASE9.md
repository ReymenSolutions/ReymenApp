# REYMEN SmartCard — Fase 9: Usuarios administrativos

> Continúa de `FASE8.md` (Fase 8, analítica). Este documento cubre `/users` -- invitar, editar y desactivar administradores desde el propio panel, en vez de necesitar `scripts/create-superadmin.mjs` cada vez. No hay migraciones SQL nuevas -- `admin_profiles` ya existía desde Fase 4, junto con su RLS.

## 1. Qué se construyó

- **Listado de usuarios** (`/users`) -- nombre, correo, rol y estado de cada admin. **Solo visible para SUPERADMIN**: ni el link del menú ni la pantalla existen para ADMIN/VIEWER (ver sección 2).
- **Invitar administrador** (`/users/new`) -- nombre, correo y rol. Reusa exactamente el mismo mecanismo que `scripts/create-superadmin.mjs` (`auth.admin.inviteUserByEmail()` + una fila en `admin_profiles`), solo que ahora lo dispara un SUPERADMIN ya logueado desde el panel en vez de correrse a mano. Es justo lo que AUTH.md sección 7 dejaba pendiente para "una fase posterior".
- **Detalle y edición** (`/users/[id]`) -- cambiar nombre y rol, y desactivar/reactivar la cuenta (equivalente al soft delete de clientes/perfiles/tarjetas, aunque aquí no se usa `deleted_at` sino la columna `is_active` que ya traía `admin_profiles` desde Fase 4).
- **Protección contra quedarte sin acceso**: nadie puede cambiar su propio rol ni desactivar su propia cuenta desde esta pantalla -- ver sección 3.
- **Auditoría**: `admin_user.invited`, `admin_user.updated`, `admin_user.role_changed` (mismo matiz que `card.destination_changed` de Fase 7 -- cambiar el rol de alguien es más significativo que cambiarle el nombre), `admin_user.deactivated`, `admin_user.reactivated`.

## 2. Por qué esta fase no reparte permisos entre los 3 roles

Todas las pantallas anteriores tienen alguna combinación de "los 3 roles ven, SUPERADMIN+ADMIN editan, solo SUPERADMIN borra". `/users` es distinta a propósito: la propia policy `admin_profiles_write` (Fase 4, `rls_policies.sql`) ya reserva **toda** escritura sobre `admin_profiles` a SUPERADMIN, y `admin_profiles_select` limita a ADMIN/VIEWER a ver solo su propia fila, nunca la de los demás. Gestionar quién tiene acceso al panel y con qué rol es, por definición, una decisión de SUPERADMIN -- así que en vez de simular una vista parcial para ADMIN/VIEWER, la pantalla completa (listado, invitar, editar) es exclusiva de SUPERADMIN. Un ADMIN o VIEWER que entre a `/users` a mano ve un mensaje explicándolo, no un error ni una pantalla vacía confusa.

## 3. La protección "no puedes quitarte tu propio acceso"

No estaba pedida explícitamente, pero es la clase de error que, si pasa, deja a alguien fuera del sistema sin que ningún otro SUPERADMIN se entere hasta que esa persona reporte que ya no puede entrar. `/users/[id]/actions.ts` la aplica en dos capas:

1. **UI**: si estás viendo tu propia cuenta, el selector de rol aparece deshabilitado y el botón "Desactivar esta cuenta" ni siquiera se renderiza.
2. **Server Action**: un campo deshabilitado no se manda en el `FormData`, pero por si alguien arma la petición a mano, `updateAdminAction` ignora cualquier rol distinto al que ya tenías cuando el `id` es el tuyo, y `deactivateAdminAction` rechaza la operación entera (`self_change_forbidden`) si el `id` coincide con quien la ejecuta.

Si de verdad hace falta cambiar el rol o desactivar a un SUPERADMIN específico, tiene que hacerlo *otro* SUPERADMIN desde su propia sesión.

## 4. De dónde sale el correo (`email`) si `admin_profiles` no lo guarda

`admin_profiles` nunca tuvo columna de correo -- vive en `auth.users`, en el schema `auth`, que PostgREST no expone (ver el comentario original de la tabla, Fase 4). Para mostrarlo en `/users` y `/users/[id]`, ambas pantallas usan `createAdminClient()` (el cliente con `service_role` de `packages/database/src/admin.ts`, que ya existía sin usarse desde Fase 4) para pedirle a Supabase Auth el listado (`auth.admin.listUsers()`) o un usuario puntual (`auth.admin.getUserById()`) y cruzarlo por `id`. Es exactamente el mismo cliente que ya usaba `scripts/create-superadmin.mjs`, solo que ahora también de lectura.

## 5. `ADMIN_URL` para el link de invitación

El script de bootstrap resuelve la URL del panel con `process.env.ADMIN_URL ?? 'http://127.0.0.1:3001'`. Desde dentro de una Server Action ese mismo `ADMIN_URL` sigue funcionando si lo defines, pero además hay un tercer paso que el script no tiene (`apps/admin/lib/admin-url.ts`): si no está definida, se deriva del propio request (`host` + protocolo), así que invitar desde `/users/new` funciona igual en local que detrás de un dominio real sin tener que mantener esa variable sincronizada a mano.

## 6. Qué queda fuera de esta fase, a propósito

- **Cambiar el correo de un admin ya existente** -- no está en el formulario de edición. Cambiar un correo en Supabase Auth típicamente implica su propio flujo de confirmación; si hace falta, por ahora es más simple desactivar la cuenta vieja e invitar una nueva.
- **Recuperación de contraseña** ("¿Olvidaste tu contraseña?" en `/login`) -- AUTH.md sección 7 ya la dejaba pendiente "junto con la fase de gestión de usuarios". Sigue pendiente; el mecanismo (`/auth/confirm` ya distingue `type=recovery` de `type=invite`) está listo, falta el formulario en `/login`.
- **Borrar un usuario por completo** (en vez de desactivarlo) -- deliberadamente no existe desde el panel, igual que clientes/perfiles/tarjetas nunca se borran físicamente. Si de verdad hace falta borrar una cuenta de Auth (por ejemplo, para poder reinvitar el mismo correo -- AUTH.md sección 9, punto 6), sigue siendo un paso manual en Supabase Studio.

## 7. Instrucciones de uso

### Paso 1 -- Descomprime el zip encima de tu proyecto

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase9-users.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- No hace falta tocar Supabase

Igual que las últimas fases, no hay migraciones nuevas.

### Paso 3 -- Reinicia el panel

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npm run dev --workspace=apps/admin
```

(Detén primero el que ya tuvieras corriendo con `Ctrl+C` en esa terminal.)

### Paso 4 -- Prueba el flujo completo (con tu cuenta SUPERADMIN)

1. Entra a `/users` desde el menú ("Usuarios" -- solo debe aparecer si tu cuenta es SUPERADMIN).
2. Da clic en "+ Invitar administrador", llena nombre/correo/rol con un correo que **no** hayas usado antes, y envíala.
3. Revisa Inbucket (`http://127.0.0.1:54324`) para ver el correo y da clic en el link -- debe llevarte a `/set-password` (mismo flujo que la Fase 4), no a esta cuenta ya logueada.
4. De vuelta en `/users` con tu SUPERADMIN, confirma que la cuenta nueva aparece con su nombre, correo y rol correctos.
5. Entra al detalle de esa cuenta nueva, cámbiale el rol y guarda -- confirma que el cambio se refleja en el listado.
6. Desactívala -- confirma que el botón "Reactivar cuenta" aparece, y que si esa persona intenta entrar a `/login` con su contraseña ya no puede (el proxy ya cierra su sesión automáticamente en el siguiente request, mecanismo que ya existía desde Fase 4).
7. Reactívala.
8. Entra a tu propia cuenta desde `/users/[tu-id]` (el link que dice "(tú)" en el listado) -- confirma que el selector de rol aparece deshabilitado y que no hay botón de "Desactivar esta cuenta".
9. Si tienes una cuenta ADMIN o VIEWER a la mano, entra con ella y confirma que el link "Usuarios" no aparece en el menú, y que si igual escribes `/users` en la barra de direcciones ves el mensaje de "Solo un SUPERADMIN puede...".

### Paso 5 -- Confirma la auditoría

```sql
select action, entity_type, entity_id, before_data, after_data, occurred_at
from audit_logs
where entity_type = 'admin_user'
order by occurred_at desc;
```

Debe haber una fila `admin_user.invited`, una `admin_user.role_changed` (del paso 5), una `admin_user.deactivated` y una `admin_user.reactivated`.

## 8. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/admin` compila sin errores de TypeScript y genera las 3 rutas nuevas (`/users`, `/users/new`, `/users/[id]`) además de todas las de fases anteriores (18 en total).
- No se pudo enviar una invitación real ni correr esto contra un Supabase real desde este entorno -- pruébalo tú siguiendo la sección 7.
