# REYMEN SmartCard — Fase 13: Recuperación de contraseña

> Continúa de `FASE12.md` (Fase 12, código QR). Este documento cubre "¿Olvidaste tu contraseña?" en `/login` -- lo último que `AUTH.md` (sección 7) había dejado pendiente "junto con la fase de gestión de usuarios" (Fase 9), sin haberse agregado ahí. No hay migraciones SQL nuevas -- todo el mecanismo (Supabase Auth, `/auth/confirm`) ya existía, faltaba la puerta de entrada.

## 1. Qué se construyó

- **`/forgot-password`** -- formulario de un solo campo (correo). Al enviarlo, siempre muestra el mismo mensaje de éxito ("si ese correo tiene cuenta, ya te mandamos instrucciones"), sin importar si el correo existe de verdad o no.
- **Link "¿Olvidaste tu contraseña?"** en `/login`, debajo del formulario.
- **`supabase/templates/recovery.html`** -- plantilla de correo nueva, hermana de `invite.html` (Fase 4), con `type=recovery` en vez de `type=invite`.
- **`/set-password` distingue los dos casos** -- "Crea tu contraseña" (primera vez, viene de una invitación) vs. "Restablece tu contraseña" (ya tenía cuenta, la olvidó). Mismo formulario, mensaje distinto -- `/auth/confirm` se lo indica con `?context=recovery` según el `type` del token que acaba de canjear.

## 2. Por qué nunca se revela si el correo existe

Mismo principio que ya aplicaba `login()` desde Fase 4 (`app/login/actions.ts`: "nunca revelar si el correo existe o no, evita enumeración de cuentas"). Si `/forgot-password` mostrara un mensaje distinto para "correo no encontrado" que para "correo encontrado, revisa tu bandeja", cualquiera podría usar ese formulario para descubrir qué correos tienen acceso al panel de administración, probando uno por uno. `requestPasswordReset()` llama a `resetPasswordForEmail()` y redirige al mismo mensaje de éxito pase lo que pase -- Supabase Auth internamente ya no manda nada si el correo no corresponde a ninguna cuenta, y eso es exactamente el comportamiento correcto: silencioso hacia afuera, sin mentir hacia quien sí tiene cuenta.

## 3. Por qué esto no usa `createAdminClient()` como `/users/new`

Fase 9 (`/users/new`) sí necesita `service_role` porque `inviteUserByEmail()` es parte de la Auth **Admin** API -- crear una cuenta desde cero es una operación privilegiada. `resetPasswordForEmail()`, en cambio, es parte de la API pública de Auth, diseñada justo para que la llame alguien *sin* sesión y sin ningún privilegio -- pedir que te reseteen tu propia contraseña no requiere ser admin de nada. Por eso `requestPasswordReset()` usa el cliente normal (`createServerSupabaseClient()`), el mismo que ya usa `login()`.

## 4. Por qué `/set-password` no estaba (y sigue sin estar) en la lista de rutas públicas del proxy

Podría parecer que `/set-password` necesita estar en `PUBLIC_PATHS` (`proxy.ts`) para que alguien sin sesión pueda llegar ahí -- pero no es así, ni con invitación ni con recuperación: en ambos casos, `/auth/confirm` ya canjeó el token con `verifyOtp()` **antes** de redirigir a `/set-password`, y ese canje es justo lo que crea la sesión (las cookies de Supabase Auth). Cuando el navegador seguido llega a `/set-password`, ya está autenticado como cualquier otra ruta protegida normal -- no necesita ninguna excepción. Lo único que sí se agregó a `PUBLIC_PATHS` en esta fase es `/forgot-password` -- ahí sí hace falta, porque es literalmente la pantalla para alguien que *no puede* iniciar sesión.

## 5. Qué le falta a tu `config.toml` -- igual que con la invitación en Fase 4

Mismo patrón exacto que `AUTH.md` sección 4 para el correo de invitación: la plantilla nueva (`supabase/templates/recovery.html`) ya viene en el zip, pero `config.toml` (que nunca se comparte, lo genera `supabase init` en tu máquina) necesita apuntar a ella. Sin esto, Supabase manda el correo de recuperación con su plantilla por defecto -- que entrega los tokens en el fragmento (`#`) de la URL, no en la query string, y `/auth/confirm` nunca los recibe. Ver la sección 6 de este documento para el paso a paso.

## 6. Qué queda fuera de esta fase, a propósito

- **Rate limiting propio del formulario** -- Supabase Auth ya limita cuántos correos de recuperación se pueden pedir por proyecto/IP en un periodo corto (mismo mecanismo que ya cubre `signInWithPassword`, mencionado en `AUTH.md` sección 7). No se agregó una capa adicional en la app.
- **Invalidar sesiones activas al restablecer la contraseña** -- si alguien más tiene una sesión abierta con la contraseña vieja, `updateUser({ password })` no la cierra automáticamente. No fue pedido, y añadirlo tocaría el flujo de sesiones para un caso (robo de sesión + robo de contraseña al mismo tiempo) fuera del alcance de esta fase.

## 7. Instrucciones de uso

### Paso 1 -- Descomprime el zip encima de tu proyecto

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase13-recovery.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- Registra la plantilla nueva en `config.toml`

Igual que hiciste para la de invitación en su momento -- abre tu `config.toml`:

```powershell
notepad "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard\supabase\config.toml"
```

Busca el bloque `[auth.email.template.invite]` que ya tienes (de Fase 4) y agrega, justo después, uno nuevo para `recovery`:

```toml
[auth.email.template.recovery]
subject = "Restablece tu contraseña de REYMEN SmartCard"
content_path = "./supabase/templates/recovery.html"
```

No toques `additional_redirect_urls` -- ya tiene lo que necesita desde Fase 4/9 (el mismo `/auth/confirm` se reusa).

### Paso 3 -- Reinicia Supabase local

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npx supabase stop
npx supabase start
```

(`restart` no siempre recarga `config.toml` -- mismo gotcha ya documentado en Fase 4.)

### Paso 4 -- Reinicia el panel

```powershell
npm run dev --workspace=apps/admin
```

### Paso 5 -- Prueba el flujo completo

1. En `/login`, da clic en "¿Olvidaste tu contraseña?".
2. Escribe el correo de una cuenta que ya tengas (por ejemplo tu SUPERADMIN) y envía.
3. Debe salir el mensaje "si ese correo tiene cuenta...", sin importar si escribiste un correo real o inventado -- pruébalo con los dos para confirmar que el mensaje no cambia.
4. Revisa Inbucket (`http://127.0.0.1:54324`) -- debe haber llegado un correo nuevo con el asunto "Restablece tu contraseña de REYMEN SmartCard". Da clic en el link.
5. Debe llevarte a `/set-password`, pero esta vez con el texto "Restablece tu contraseña" (no "Es la primera vez que entras").
6. Define una contraseña nueva y guarda -- debe mandarte al panel (`/`), ya con sesión iniciada.
7. Cierra sesión y vuelve a entrar por `/login` con la contraseña nueva -- confirma que la vieja ya no funciona y la nueva sí.
8. Prueba un link viejo/ya usado (por ejemplo, vuelve a abrir el mismo correo de Inbucket después del paso 6) -- debe mandarte a `/login` con el mensaje "El enlace para restablecer tu contraseña no es válido o ya expiró", no el mensaje genérico de invitación.

## 8. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/admin` compila sin errores de TypeScript y genera la ruta nueva (`/forgot-password`), 23 rutas en total.
- No se pudo mandar un correo real ni correr esto contra un Supabase real desde este entorno -- pruébalo tú siguiendo la sección 7.
