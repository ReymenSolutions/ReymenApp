# REYMEN SmartCard — Fase 15: Preparar para producción

> Continúa de `FASE14.md` (Fase 14, subir fotos/logos). Esta fase no agrega ninguna pantalla nueva -- arma la infraestructura de despliegue que `ARCHITECTURE.md` (secciones 6-8) ya había planeado desde la Fase 1 (VPS propio + Docker + Nginx + Let's Encrypt), más el checklist de todo lo que hay que cambiar/configurar para que el proyecto deje de vivir solo en tu laptop. Se confirmaron tres decisiones contigo antes de construir esto: VPS propio con Docker (como ya estaba planeado), Supabase Cloud (no self-hosted), y correo por Resend (recomendación, sección 2). El dominio `reymensolutions.mx` todavía no está registrado -- eso no bloquea el resto de esta fase, pero sí dos pasos puntuales que quedan marcados como pendientes hasta que lo esté.

## 1. Qué se construyó

- **`apps/admin/Dockerfile`, `apps/public/Dockerfile`** -- build de producción de cada app, en 3 etapas (dependencias, compilación, imagen final). Usan la salida `standalone` de Next.js (agregada a ambos `next.config.js`), que deja una imagen final mínima -- nada de código fuente, nada del `node_modules` completo del monorepo.
- **`infra/docker-compose.yml`** -- levanta las dos apps juntas, cada una con su propio `.env.production` (no incluido -- lo creas tú en el VPS, ver sección 5).
- **`infra/nginx/`** -- `link.conf` (reymensolutions.mx + link.reymensolutions.mx → apps/public), `admin.conf` (admin.reymensolutions.mx → apps/admin), `rate-limits.conf` y `snippets/proxy-common.conf`. Listos para copiarse a `/etc/nginx/` en el VPS.
- **`get_public_profile_slugs()`** (migración `20260911120001_public_sitemap_rpc.sql`) + **`apps/public/app/sitemap.ts`** y **`apps/public/app/robots.ts`** -- sitemap dinámico (solo perfiles activos y no marcados `is_noindex`) y robots.txt que bloquea las rutas de puro tracking (`/n/`, `/q/`, `/c/`, `/l/`).
- **`apps/admin/public/.gitkeep`, `apps/public/public/.gitkeep`** -- ninguna de las dos apps tenía carpeta `public/` todavía; el Dockerfile la copia siempre, así que necesita existir aunque esté vacía.

## 2. Recomendación de SMTP: Resend

Pediste una recomendación, así que aquí va con su razonamiento -- no es la única opción válida, es la que mejor encaja con el volumen real de este proyecto (invitaciones y recuperación de contraseña de un panel administrativo interno, no marketing masivo):

- **Resend** -- 3,000 correos/mes gratis (100/día), configuración por SMTP en cinco minutos (host `smtp.resend.com`, puerto 465), pensado específicamente para este caso de uso (correos transaccionales desde una app), y es la opción que la propia documentación de Supabase usa más seguido como ejemplo. Para el volumen de este panel (probablemente decenas de correos al mes, no miles), el plan gratis alcanza de sobra.
- **Alternativa: Brevo** (antes Sendinblue) -- 300 correos/día gratis, también con SMTP simple. Vale la pena si en algún momento REYMEN quiere mandar también correos de marketing/newsletter a clientes, porque Brevo ya trae esa parte integrada; para solo correos transaccionales, Resend es más simple.

Cualquiera de las dos funciona con el mecanismo que ya tiene el proyecto (Supabase Auth + plantillas custom en `supabase/templates/`, Fase 4/13) -- lo único que cambia es de dónde salen los correos, no cómo se arman.

## 3. Supabase Cloud -- de local a producción

Hasta ahora todo corrió contra `supabase start` (Postgres + Auth + Storage en Docker, en tu laptop). Un proyecto de Supabase Cloud es la misma pila, hospedada por Supabase -- estos son los pasos para llevar el esquema y la configuración de Auth para allá.

### 3.1 Crear el proyecto y enlazarlo

Desde [supabase.com/dashboard](https://supabase.com/dashboard), crea un proyecto nuevo (elige una región cercana a México -- `us-east-1` o `sa-east-1` según qué tan cerca la quieras del VPS). Anota el **Project Reference** (20 caracteres, aparece en la URL del dashboard y en Project Settings → General).

```bash
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npx supabase link --project-ref TU_PROJECT_REF
```

Te va a pedir la contraseña de la base de datos que elegiste al crear el proyecto.

### 3.2 Subir el esquema completo

```bash
npx supabase db push --dry-run
```

Revisa que la lista de migraciones que muestra sea la completa (todas las de `supabase/migrations/`, incluidas las de esta sesión: la de Storage de Fase 14 y la del sitemap de esta fase). Si se ve bien:

```bash
npx supabase db push
```

Esto crea todas las tablas, funciones, políticas RLS y el bucket `profile-media` en el proyecto de Cloud -- desde cero, sin datos de prueba (`seed.sql` es solo para local, `DATABASE.md` ya lo aclaraba desde la Fase 2).

### 3.3 Configurar SMTP y las plantillas de correo

**Dos caminos -- usa el que te dé más confianza, no hace falta hacer los dos:**

**Camino A (recomendado para la primera vez): el Dashboard.** Project Settings → Authentication → SMTP Settings, activa "Enable Custom SMTP" y llena host/puerto/usuario/contraseña de Resend (te los da su dashboard al crear un dominio/API key ahí). Luego, en Authentication → Email Templates, pega el contenido de `supabase/templates/invite.html` y `supabase/templates/recovery.html` en las plantillas "Invite user" y "Reset password" respectivamente -- son las mismas plantillas que ya usas en local, no hay que reescribirlas.

**Camino B (por CLI, `supabase config push`).** Tu `config.toml` local ya tiene los bloques `[auth.email.template.invite]` y `[auth.email.template.recovery]` (Fase 4/13) -- se pueden empujar directo al proyecto de Cloud agregando primero el bloque SMTP:

```toml
[auth.email.smtp]
enabled = true
host = "smtp.resend.com"
port = 465
user = "resend"
pass = "env(RESEND_SMTP_PASSWORD)"
sender_name = "REYMEN SmartCard"
```

(`pass` lee la variable de entorno `RESEND_SMTP_PASSWORD` en vez de guardar la contraseña en texto plano dentro de `config.toml` -- expórtala en tu terminal antes de correr `config push`.)

Antes de empujar nada, revisa qué va a cambiar:

```bash
npx supabase config diff
```

**Importante -- lee esto antes de correr `config push`:** tu `config.toml` local también tiene `site_url` y `additional_redirect_urls` apuntando a `127.0.0.1:3001` (desarrollo). Si los dejas así y corres `config push`, le vas a pegar esas URLs de localhost al proyecto de producción -- rompiendo cualquier link de invitación/recuperación real. Antes de empujar, cambia esos dos valores a las URLs reales:

```toml
site_url = "https://admin.reymensolutions.mx"
additional_redirect_urls = ["https://admin.reymensolutions.mx/auth/confirm", "https://admin.reymensolutions.mx/**"]
```

Con eso ya corregido:

```bash
npx supabase config push
```

### 3.4 Las claves que necesitas para las apps

Project Settings → API, en el proyecto de Cloud:

- `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
- `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (solo `apps/admin`, nunca `apps/public` -- ver sección 5)

## 4. Qué queda fuera de esta fase, a propósito

- **DNS y certificados reales** -- el dominio `reymensolutions.mx` todavía no está registrado. Las configs de Nginx (sección 1) ya están listas con ese dominio -- en cuanto lo registres y apuntes los registros DNS (A/AAAA de `reymensolutions.mx`, `www`, `link` y `admin` hacia la IP del VPS), corre certbot y ya. Los pasos exactos están en la sección 6.
- **CSP (Content-Security-Policy) completa** -- `next.config.js` ya trae un comentario desde antes de esta fase avisando que llega en "Fase 16 - Seguridad". Los headers base (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) ya estaban puestos desde antes y siguen ahí.
- **Self-hosted Supabase** -- se descartó explícitamente (elegiste Supabase Cloud), así que no hay `docker-compose` para Postgres/Auth/Storage/Studio en el VPS.
- **Backups automatizados, monitoreo/alertas, CI/CD** -- Supabase Cloud ya incluye backups automáticos según el plan que elijas (revísalo en su dashboard); no se armó nada adicional aquí. Un pipeline de CI/CD (GitHub Actions build + deploy automático al hacer push) tampoco -- por ahora el despliegue es manual (sección 6), razonable para el volumen de cambios actual.
- **`packages/lib` trae `qrcode`, que es JS puro -- no hay ninguna dependencia nativa (canvas, sharp para transformación de imágenes, etc.) en el código propio del proyecto.** Sí aparece `sharp` empaquetado dentro de la imagen final por Next.js (lo incluye por si algo usa `next/image`, que este proyecto no usa -- todos los `<img>` son planos, a propósito, ver comentarios en `ProfileView.tsx`) -- infla un poco el tamaño de la imagen de Docker sin ningún beneficio real. No se optimizó esto en esta fase; es seguro, solo no es el build más chico posible.

## 5. Checklist de variables de entorno de producción

Cada app necesita su propio `.env.production` en el VPS (no se sube al repo, igual que `.env.local` en desarrollo). Referencia rápida de qué cambia respecto a local:

**`apps/admin/.env.production`:**
```
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key real>
SUPABASE_SERVICE_ROLE_KEY=<service_role key real -- nunca en apps/public>
PUBLIC_SITE_URL=https://link.reymensolutions.mx
ADMIN_URL=https://admin.reymensolutions.mx
```
`NEXT_PUBLIC_SUPABASE_STORAGE_URL` (Fase 14) se deja **sin definir** -- esa variable existe solo para el problema de `127.0.0.1` en desarrollo local; en producción `NEXT_PUBLIC_SUPABASE_URL` ya es un dominio real, alcanzable desde cualquier lado, no hace falta ninguna sustitución.

**`apps/public/.env.production`:**
```
NEXT_PUBLIC_SUPABASE_URL=https://TU_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key real -- la misma que en admin>
NEXT_PUBLIC_SITE_URL=https://link.reymensolutions.mx
```

## 6. Instrucciones de uso

### En tu computadora (Windows) -- aplica los archivos de esta fase

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase15-produccion.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npx supabase db reset
```

(`db reset` aplica la migración nueva del sitemap contra tu Supabase local -- igual que en cada fase anterior. `npm run build --workspace=apps/admin` y `--workspace=apps/public` ya se corrieron desde este entorno, sin errores.)

Sigue la sección 3 (Supabase Cloud) y la sección 2 (SMTP) cuando tengas listo el proyecto de Cloud y la cuenta de Resend.

### En el VPS (Ubuntu) -- cuando lo tengas listo, por SSH

Estos comandos ya NO son PowerShell -- son para la terminal del VPS.

```bash
# 1. Docker + Docker Compose (si el VPS no los tiene todavía)
curl -fsSL https://get.docker.com | sh

# 2. Clona el repo (o sube el código por scp/rsync, lo que prefieras)
git clone <tu-repo> reymen-smartcard
cd reymen-smartcard

# 3. Crea los .env.production (sección 5) en apps/admin/ y apps/public/
nano apps/admin/.env.production
nano apps/public/.env.production

# 4. Levanta las dos apps
docker compose -f infra/docker-compose.yml up -d --build

# 5. Confirma que responden localmente antes de tocar Nginx
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1:3001
```

**Cuando el dominio esté registrado y el DNS apunte a la IP del VPS:**

```bash
# 6. Instala Nginx y certbot
sudo apt update && sudo apt install -y nginx certbot python3-certbot-nginx

# 7. Copia las configs de este repo
sudo cp infra/nginx/rate-limits.conf /etc/nginx/rate-limits.conf
sudo mkdir -p /etc/nginx/snippets
sudo cp infra/nginx/snippets/proxy-common.conf /etc/nginx/snippets/proxy-common.conf
sudo cp infra/nginx/link.conf /etc/nginx/sites-available/link.conf
sudo cp infra/nginx/admin.conf /etc/nginx/sites-available/admin.conf
sudo ln -s /etc/nginx/sites-available/link.conf /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/admin.conf /etc/nginx/sites-enabled/

# 8. Agrega `include /etc/nginx/rate-limits.conf;` dentro del bloque http{}
#    de /etc/nginx/nginx.conf (edítalo a mano)
sudo nano /etc/nginx/nginx.conf

# 9. Certbot genera los certificados y reescribe los bloques 443 solo
sudo certbot --nginx -d reymensolutions.mx -d www.reymensolutions.mx -d link.reymensolutions.mx
sudo certbot --nginx -d admin.reymensolutions.mx

sudo nginx -t && sudo systemctl reload nginx
```

## 7. Cómo se validó esto

- `npm run build --workspace=apps/admin` y `npm run build --workspace=apps/public` compilan sin errores, con `output: 'standalone'` activado -- se inspeccionó a mano la salida real de `.next/standalone` de ambos para confirmar exactamente qué archivos copia cada `Dockerfile` (`apps/<app>/server.js`, `.next/static` aparte, `public/`) -- no se adivinó la estructura, se verificó contra el build real generado en este entorno.
- Se confirmó que `@reymen/database` y `@reymen/lib` quedan compilados (bundleados) dentro de los chunks del servidor de Next.js -- no aparecen como carpeta propia en `node_modules` de la salida standalone, así que el Dockerfile no necesita copiar `packages/` por separado.
- **No se pudo correr `docker build` de punta a punta desde este entorno** -- la política de red de este sandbox bloquea la descarga de `node:22-alpine` desde Docker Hub (mismo tipo de restricción que ya bloqueó Google Fonts en la Fase 11). Prueba el build tú, en tu VPS o en tu computadora con Docker Desktop:
  ```bash
  docker build -f apps/admin/Dockerfile -t reymen-admin .
  docker build -f apps/public/Dockerfile -t reymen-public .
  ```
- Los comandos de `supabase link`/`db push`/`config diff`/`config push` se verificaron contra la versión real de la CLI (`supabase 2.117.0`, la misma que ya vienes usando) -- no se inventó ninguna bandera.
