# REYMEN SmartCard — Fase 4: Autenticación

> Continúa de `DATABASE.md` (Fase 2) y del scaffolding de Fase 3. Este documento cubre el login de `apps/admin`, la protección de rutas, y el proceso completo para crear el primer SUPERADMIN (invitación, primer login, cambio de contraseña) que `DATABASE.md` sección 10 dejó pendiente a propósito.

## 1. Qué se construyó

- **Sesión real con Supabase Auth.** `/login` es un formulario email + contraseña que llama a `signInWithPassword` desde una Server Action (`apps/admin/app/login/actions.ts`) -- funciona con JS deshabilitado, como cualquier `<form>` normal.
- **Protección de rutas.** `apps/admin/proxy.ts` (antes `middleware.ts` -- Next.js 16 renombró la convención, ver sección 6) exige sesión válida en toda ruta salvo `/login` y `/auth/confirm`, igual que fijó `ARCHITECTURE.md` sección 8.
- **Sin registro público (sección 70).** No existe ningún formulario de alta. Las cuentas se crean por invitación: alguien con `service_role` (hoy, el script de bootstrap; en una fase futura, un SUPERADMIN desde `/users`) crea el `auth.users` y la fila de `admin_profiles` juntos.
- **Primer login = cambio de contraseña.** Un usuario invitado no tiene contraseña todavía. El link del correo lo autentica una sola vez (`/auth/confirm`) y lo manda directo a `/set-password`, donde define su contraseña real antes de poder usar `/login` normalmente.
- **Bootstrap del primer SUPERADMIN.** `scripts/create-superadmin.mjs`, corrido a mano una sola vez.

## 2. Por qué Server Actions y no un formulario con `fetch` desde el cliente

El login, el cambio de contraseña y el logout son todos Server Actions (`'use server'`) o Route Handlers, nunca llamadas desde un Client Component al cliente de navegador de Supabase. Dos razones:

1. **Cookies.** La sesión de Supabase Auth vive en cookies HttpOnly que pone el propio Next.js vía `@supabase/ssr` (`packages/database/src/server.ts`). Si el login corriera en el navegador con el cliente de `browser.ts`, la cookie la pondría el SDK de Supabase directo, sin pasar por la infraestructura de cookies de Next.js -- funciona, pero es una fuente de sesión distinta a la que ya usan `server.ts` y el middleware, y son justo el tipo de inconsistencia sutil que después cuesta debuggear.
2. **Progresividad.** Un `<form action={login}>` funciona sin JavaScript. No es el requisito principal aquí (es un panel interno), pero es gratis con Server Actions y no lo es con `fetch`.

## 3. El flujo de invitación en detalle: por qué `/auth/confirm` y no el link de Supabase directo

Supabase Auth, al invitar a alguien, manda un correo cuyo botón por defecto apunta a su propio endpoint (`/auth/v1/verify`). Ese endpoint valida el token y **redirige con los tokens de sesión en el fragmento de la URL** (`#access_token=...`), porque está pensado para apps 100% del lado del cliente. El problema: el fragmento (`#...`) nunca se manda al servidor -- ningún Route Handler ni Server Component de Next.js puede leerlo. Para una app con SSR como esta, el patrón recomendado por Supabase es:

1. La plantilla de invitación (`supabase/templates/invite.html`) apunta directo a nuestra propia ruta: `{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=invite` -- `token_hash` y `type` sí van en la query string, visibles para el servidor.
2. `apps/admin/app/auth/confirm/route.ts` (un Route Handler) recibe esos parámetros y llama a `supabase.auth.verifyOtp({ type, token_hash })` del lado del servidor, que establece la sesión en cookies igual que cualquier otro cliente de `server.ts`.
3. De ahí redirige a `/set-password`.

Este mismo mecanismo sirve tanto para el primer SUPERADMIN como para cualquier invitación futura -- no hay dos caminos distintos.

## 4. Qué le falta a este repo que tienes que completar tú a mano

`supabase/config.toml` **no viene en este paquete** (nunca estuvo en los zips de Fase 2/3 -- lo genera `supabase init` localmente y no se compartió). Sin dos ajustes ahí, el correo de invitación no va a funcionar:

1. **Plantilla de invitación.** Agrega esto a `supabase/config.toml` (la plantilla ya existe en `supabase/templates/invite.html`, solo falta que el config apunte a ella):

   ```toml
   [auth.email.template.invite]
   subject = "Te invitaron a REYMEN SmartCard Admin"
   content_path = "./supabase/templates/invite.html"
   ```

2. **Redirect permitido.** Supabase Auth rechaza cualquier `redirectTo` que no esté en la lista blanca. Agrega el puerto de `apps/admin` a `additional_redirect_urls`:

   ```toml
   [auth]
   additional_redirect_urls = ["http://127.0.0.1:3001/auth/confirm", "http://127.0.0.1:3001/**"]
   ```

   (si tu `config.toml` ya tiene `additional_redirect_urls` con otros valores, solo agrega estos dos a la lista, no la reemplaces.)

3. **Reinicia Supabase local** después de editar `config.toml` (`npx supabase stop` y luego `npx supabase start` -- `restart` no siempre recarga `config.toml`).

Sin esto, el script de bootstrap igual crea el usuario y la fila en `admin_profiles` correctamente -- lo único que falla es que el correo no llega o el link no redirige bien. Puedes confirmar el `token_hash` real desde Inbucket (`http://127.0.0.1:54324`, el buzón de pruebas que trae Supabase CLI) y construir la URL a mano si necesitas probar antes de tocar el `config.toml`.

## 5. Cómo crear el primer SUPERADMIN

No puede invitarse desde el panel -- todavía no existe nadie que pueda entrar a invitarlo. Por eso es un script aparte, corrido una sola vez con la `service_role_key`:

```bash
# 1. Asegúrate de tener apps/admin/.env.local con NEXT_PUBLIC_SUPABASE_URL
#    y SUPABASE_SERVICE_ROLE_KEY (los valores que imprime `supabase start`).

# 2. Desde la raíz del proyecto:
npm run create-superadmin -- --email tu-correo@ejemplo.com --name "Tu Nombre"

# 3. Revisa Inbucket (http://127.0.0.1:54324) para ver el correo y dar clic
#    en el link. Vas a caer en /set-password -- define tu contraseña ahí.

# 4. Ya puedes entrar por /login normalmente.
```

El mismo script sirve para crear un `ADMIN` o `VIEWER` fuera del panel si hiciera falta (`--role ADMIN`), aunque el camino normal para esos será invitarlos desde `/users` una vez que esa sección exista (fase futura) -- reusa exactamente la misma lógica (`inviteUserByEmail` + insert en `admin_profiles`), solo que ejecutada por un SUPERADMIN autenticado en vez de por este script.

## 6. Nota sobre Next.js 16: `middleware.ts` → `proxy.ts`

`apps/admin/AGENTS.md` (auto-generado por `next dev`) advierte que esta versión de Next.js tiene cambios que rompen lo que el entrenamiento de un modelo pudiera "saber" de memoria. Uno de esos cambios aplica directo a esta fase: en Next.js 16, la convención `middleware.ts` está deprecada a favor de `proxy.ts` (mismo mecanismo -- código que corre antes de cada request -- solo cambia el nombre del archivo, el nombre de la función exportada, y el runtime por defecto pasa de Edge a Node.js). Este repo ya usa el nombre nuevo (`apps/admin/proxy.ts`, función `proxy`). Si en algún momento ves `middleware.ts` en un tutorial o en el propio training de un modelo, en este proyecto es `proxy.ts`.

## 7. Qué queda fuera de esta fase, a propósito

- **Gestión de usuarios desde el panel** (`app/users/`, invitar/desactivar admins con UI) -- la lógica ya existe (el script de bootstrap la reusa), pero la pantalla es de una fase posterior.
- **Recuperación de contraseña** ("olvidé mi contraseña" desde `/login`) -- mismo mecanismo de `/auth/confirm` (Supabase distingue `type=recovery` de `type=invite`, y la ruta ya lo soporta vía el parámetro `type`), pero falta el link "¿Olvidaste tu contraseña?" en `/login` y su formulario para pedir el correo. Se agrega junto con la fase de gestión de usuarios.
- **Rate limiting del login** -- Supabase Auth ya limita intentos de `signInWithPassword` por default a nivel de proyecto; no se agregó una capa adicional en la app.

## 8. Cómo se validó esto

- `npm run build --workspace=apps/admin` compila sin errores de TypeScript y genera las 5 rutas nuevas (`/`, `/login`, `/auth/confirm`, `/auth/logout`, `/set-password`) más el proxy, sin el warning de convención deprecada.
- `node --check scripts/create-superadmin.mjs` confirma que el script es JavaScript válido (no se pudo correr contra un Supabase real desde este entorno -- pruébalo tú siguiendo la sección 5).
