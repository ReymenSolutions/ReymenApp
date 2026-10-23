# REYMEN SmartCard — Fase 6: Perfiles digitales

> Continúa de `FASE5.md` (Fase 5, clientes). Este documento cubre el segundo módulo de datos del panel: alta, listado, edición y baja de perfiles digitales, más la gestión de sus links públicos. No hay migraciones SQL nuevas -- todo el esquema ya existía desde Fase 2 (`profiles`, `profile_links`, `themes`).

## 1. Qué se construyó

- **Listado de perfiles** (`/profiles`) -- tabla con búsqueda (nombre, slug o empresa) y, opcionalmente, filtrado por cliente (`?client_id=...`, usado cuando llegas desde el detalle de un cliente). Solo perfiles no dados de baja.
- **Alta de perfil** (`/profiles/new`, o `/profiles/new?client_id=...` desde el botón "+ Nuevo perfil" en el detalle de un cliente) -- formulario con cliente (obligatorio, selector), slug (obligatorio), nombre a mostrar (obligatorio) y el resto de los campos de contacto/redes/tema.
- **Detalle y edición** (`/profiles/[id]`) -- el mismo set completo de campos que define `DATABASE.md` (contacto, redes sociales, foto/logo por URL, dirección, tema visual, `is_noindex`, estado). VIEWER lo ve con los campos deshabilitados.
- **Gestión de links del perfil público** (dentro de `/profiles/[id]`) -- agregar, eliminar, activar/desactivar y reordenar (↑/↓) los botones que va a ver quien escanee la tarjeta. Es la tabla `profile_links` de Fase 2, ahora con una pantalla real encima.
- **Baja y reactivación** (soft delete vía `deleted_at`, solo SUPERADMIN) -- mismo patrón exacto que clientes en Fase 5.
- **Auditoría** -- `profile.created`, `profile.updated`, `profile.deleted`, `profile.reactivated` quedan en `audit_logs` igual que las acciones de clientes (reutiliza `log_admin_action()` de Fase 5, sin necesidad de ninguna función nueva).
- **Mensajes de error legibles para las reglas que ya vivían en SQL** (`apps/admin/lib/db-errors.ts`) -- ver sección 2.

## 2. El slug: tres reglas que ya existían en la base de datos, ahora con mensaje humano

`profiles.slug` (Fase 2) tiene tres protecciones a nivel de Postgres, no de la app:

1. Formato: `check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')` -- solo minúsculas, números y guiones simples.
2. Único entre perfiles activos: `idx_profiles_slug_active` (índice único parcial `where deleted_at is null`).
3. No puede ser una palabra reservada: el trigger `prevent_reserved_slug()` contra la tabla `reserved_slugs` (`admin`, `api`, `login`, etc.).

Las tres son intencionalmente reglas de base de datos, no de la aplicación (`DATABASE.md` sección 2) -- así que un formulario, sin importar en qué framework esté escrito, no puede saltárselas. El problema práctico es que Postgres las rechaza con sus propios códigos de error (`23505` para el índice único, `23514` para el check de formato, `P0001` para la excepción del trigger), que no son un mensaje que un admin deba leer tal cual.

`apps/admin/lib/db-errors.ts` (`describeSaveError(error)`) traduce esos códigos a una de tres claves (`slug_taken`, `slug_invalid`, `save_failed`), que las páginas de perfil mapean a texto en español. Si algún día se agrega una regla nueva a nivel de base de datos (por ejemplo, un formato distinto de teléfono), esta es la función a la que hay que agregarle un caso -- no hace falta duplicar la regla en JavaScript.

## 3. Por qué reordenar links es un intercambio de `sort_order`, no un campo de texto

`profile_links.sort_order` es un entero simple. En vez de pedirle al admin que escriba un número (fácil de arruinar, con posibles empates), los botones ↑/↓ en `/profiles/[id]` hacen un intercambio: leen la lista completa ordenada, ubican el link y su vecino, e intercambian sus dos valores de `sort_order` en dos `UPDATE` separados. Es la misma idea de "no exponer el mecanismo interno" que ya se usó para `card_code` en Fase 2 -- el admin ve una lista que sube y baja, nunca un número que tenga que administrar a mano.

## 4. Qué queda fuera de esta fase, a propósito

- **Subir fotos/logos como archivo** -- por ahora `photo_url` y `logo_url` son campos de texto donde se pega una URL ya existente. Conectar un `<input type="file">` a Supabase Storage (que ya está en el stack, `ARCHITECTURE.md` sección 6) es una fase separada, porque implica crear el bucket, sus políticas de acceso, y manejar la subida desde el navegador -- no es solo un campo más en el formulario.
- **`theme_overrides`** -- el campo JSONB para personalizar colores/logo sobre un tema base (Fase 2, sección de `profiles`) no tiene UI todavía. Se agrega junto con una vista previa visual del perfil, que tiene más sentido resolver junto con la fase de tarjetas/analítica que con la de datos crudos.
- **Vista previa del perfil público** -- no hay un botón "Ver como se vería" en el panel. Mientras tanto, se puede armar la URL a mano (`link.reymensolutions.mx/{slug}`, o `http://127.0.0.1:3000/{slug}` en local) una vez que `apps/public` tenga la ruta `/[slug]` completa (todavía es un scaffold).
- **Auditoría de cada cambio en `profile_links`** -- a propósito no se registra cada alta/baja/reorden de un link individual en `audit_logs`, siguiendo el mismo criterio que ya fijó esa tabla en Fase 2 ("solo cambios administrativos relevantes, no cada clic del panel"). Sí se audita el perfil como entidad completa.

## 5. Instrucciones de uso

### Paso 1 -- Descomprime el zip encima de tu proyecto

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase6-profiles.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- No hace falta tocar Supabase

A diferencia de Fase 5, esta fase no agrega ninguna migración SQL -- `profiles`, `profile_links` y `themes` ya existían desde Fase 2. Si Supabase local ya está corriendo, no hace falta reiniciarlo. Si no está corriendo:

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npx supabase start
```

### Paso 3 -- Arranca (o reinicia) el panel

Si `npm run dev --workspace=apps/admin` ya estaba corriendo, deténlo (`Ctrl+C`) y vuelve a correrlo para que tome los archivos nuevos:

```powershell
npm run dev --workspace=apps/admin
```

### Paso 4 -- Prueba el flujo completo (con tu cuenta SUPERADMIN)

1. Entra a `http://127.0.0.1:3001/clients`, abre el detalle de un cliente (por ejemplo "María Mendoza", del seed) y da clic en "+ Nuevo perfil".
2. Llena slug (ej. `maria-mendoza-2`, ya que `maria-mendoza` puede estar tomado por el perfil del seed) y nombre a mostrar; guarda. Debes caer en el detalle del perfil recién creado.
3. Prueba el formato del slug a propósito: intenta guardar con un slug como `Maria Mendoza` (mayúsculas/espacios) o `admin` -- debes ver el mensaje de error correspondiente, no un error crudo de Postgres.
4. En el detalle del perfil, agrega un par de links en la sección "Links del perfil público" (título + URL). Prueba subir/bajar uno con las flechas, desactivar uno, y eliminar otro.
5. Desde `/profiles`, busca por el nombre o slug que usaste -- confirma que aparece.
6. Da de baja el perfil desde su detalle -- debe desaparecer de `/profiles`. Reactívalo desde la misma URL directa.

### Paso 5 -- Confirma los tres roles

Igual que en Fase 5: con tu cuenta ADMIN, confirma que puede crear/editar perfiles y gestionar links, pero no ve "Dar de baja este perfil". Con tu cuenta VIEWER, confirma que ve todo pero no puede editar ni gestionar links (no aparecen los botones de agregar/eliminar/reordenar).

### Paso 6 -- Confirma la auditoría

```sql
select action, entity_type, entity_id, before_data, after_data, occurred_at
from audit_logs
where entity_type = 'profile'
order by occurred_at desc
limit 10;
```

## 6. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/admin` compila sin errores de TypeScript y genera las 3 rutas nuevas (`/profiles`, `/profiles/new`, `/profiles/[id]`) además de todas las de Fases 4 y 5.
- No se pudo correr contra un Supabase real desde este entorno -- pruébalo tú siguiendo la sección 5.
