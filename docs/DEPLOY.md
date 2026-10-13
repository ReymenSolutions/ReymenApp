# Despliegue de ReymenApp (VPS)

## Qué corre y dónde
- Carpeta: `/home/emilianorm/reymen-ai-ops-preview` (dueño `emilianorm`). Producción despliega **solo desde `main`**.
- Compose: `docker/docker-compose.preview.yml` es **local del servidor y no está versionado** (lleva dominios, red `proxy-net` y variables propias). Si no existe, `deploy/update.sh` usa `docker/docker-compose.prod.yml`, que sí está versionado.
- Entorno: `.env.preview` junto al compose (no se versiona; la plantilla de variables es `.env.example`).
- Contenedores por defecto: app `reymen-ai-ops-preview`, base `reymen-ai-ops-preview-postgres`. Con otro compose: `COMPOSE_FILE_PATH`, `APP_SERVICE`, `APP_CONTAINER`, `DB_CONTAINER`.

## Reconstruir el servidor desde cero (checklist)
1. Docker + `git`; clonar el repo en la carpeta de arriba y `git checkout main`.
2. Crear `.env.preview` desde `.env.example` (todas las que apliquen: `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`, `RESEND_API_KEY`, `STRIPE_*`, `SMARTCARD_WEBHOOK_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_*`, `ANTHROPIC_API_KEY`…).
3. Crear `docker/docker-compose.preview.yml` a partir de `docker/docker-compose.prod.yml` (mismos servicios `app` y `postgres`, `env_file`, red externa `proxy-net` y las variables del proxy inverso del servidor). **Guardar una copia de este archivo fuera del servidor**: es la única pieza que no está en el repo.
4. Restaurar la base desde un respaldo (`pg_restore`, ver abajo) o dejar que `update.sh` aplique las migraciones.
5. `sudo deploy/update.sh` (construye, migra con respaldo previo y espera `/api/health`).
6. `sudo deploy/install-cron.sh` (reloj de automatizaciones, reintento de webhooks, avisos de cobro y respaldo diario).

## Respaldos
- `deploy/update.sh` respalda antes de cada migración (`backups/antes-de-migrar-*.dump`).
- `deploy/backup.sh` (instalado por `install-cron.sh`, diario 9:30 UTC): `pg_dump -Fc`, rotación de 14 días y, si configuras `BACKUP_REMOTE` en `/etc/reymen-backup.env`, copia **fuera del VPS** (`rclone:<remoto>:<carpeta>` o `scp:usuario@host:/ruta/`). Sin eso, el script avisa que el respaldo vive solo en el servidor.
- `deploy/restore-test.sh [archivo]`: restaura en un Postgres temporal y cuenta filas. Córrelo al menos una vez al mes: un respaldo que nunca se restauró no es un respaldo.
- Restauración real: `docker exec -i <db> pg_restore -U <usuario> -d <base> --clean --if-exists --no-owner < archivo.dump` (con la app detenida).

## Zona horaria
El día de negocio de Food (ventas de hoy, gráfica por hora, conteos diarios por platillo) usa la zona de **cada organización** (`Organization.timezone`, por defecto `America/Mexico_City`), no la del servidor. Los conteos diarios guardan la fecha local a las 00:00 UTC; si el contenedor corría en UTC (lo normal) los datos anteriores ya tienen esa forma y no se migran. Verifica con `docker exec reymen-ai-ops-preview date +%Z` (debe decir `UTC`). Cada cliente se configura con su zona en Admin → Cliente.

## Que te avisen si algo falla (Healthchecks.io, gratis)
1. Crea una cuenta en healthchecks.io y dos *checks*: **respaldo diario** (Period 1 día, Grace 3 horas) y **prueba de restauración** (Period 1 mes, Grace 2 días). Configura tu correo en *Integrations*.
2. Copia la *ping URL* de cada uno y agrégalas a `/etc/reymen-backup.env` (una por línea):
   `HEALTHCHECK_BACKUP_URL=https://hc-ping.com/xxxxxxxx-...`
   `HEALTHCHECK_RESTORE_URL=https://hc-ping.com/yyyyyyyy-...`
3. Listo: el respaldo avisa al terminar bien; la prueba de restauración corre sola el día 1 de cada mes y avisa si salió bien o mal (`/fail`). Si un respaldo deja de correr, Healthchecks te escribe cuando pasa el plazo.
