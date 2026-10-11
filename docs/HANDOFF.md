# REYMEN — Documento de continuidad (ReymenApp + ReymenPOS)

> **Última actualización:** 2026-10-05, al cerrar una sesión larga con Claude Code.
> **Para qué sirve:** que otra sesión (Claude, Codex u otra persona) continúe exactamente donde se quedó, sin perder contexto.
> **Dónde vive:** el mismo archivo está en ambos repositorios, en `docs/HANDOFF.md`.
> **Secretos:** no contiene ninguno, solo nombres de variables de entorno.
> **Estados:** **[A]** hecho y verificado · **[B]** hecho, falta confirmarlo en producción · **[D]** pendiente · **[E]** descartado · **[?]** no verificable desde el código.

---

## 0. Cómo continuar (léelo primero)

**Prompt sugerido para la nueva sesión:**

> Lee `docs/HANDOFF.md` de `ReymenSolutions/ReymenApp` y de `ReymenSolutions/ReymenPOS` (es el mismo archivo). Ahí está el estado completo del proyecto, las decisiones tomadas y los pendientes. Respóndeme siempre en español. Trabaja en una rama, abre un PR hacia `main`, espera a que el CI pase y fusiónalo con squash. Producción solo se despliega desde `main` y el despliegue lo corro yo en el VPS. Continúa con: <lo que quieras hacer>.

**Reglas de trabajo que pidió el usuario:**
- Responder **en español**, con lenguaje simple. El usuario no es programador de tiempo completo y muchas veces escribe desde el celular.
- Flujo: rama → PR → CI en verde → **squash merge**. El usuario dio permiso permanente de "abrir PR y hacer el merge cuando se requiera".
- Producción **siempre desde `main`**. Nunca desplegar ramas `claude/*`. El usuario corre los despliegues en el VPS.
- Al dar comandos para el VPS: **una sola línea**, lista para copiar y pegar. Desde el celular, los saltos de línea se pegan mal.
- Antes de afirmar que algo funciona, probarlo: pruebas, build y, en lo visual, navegador (Playwright con Chromium).

---

## 1. Nombres (decisión final del usuario)

| Cosa | Nombre |
|---|---|
| Repo de la plataforma (antes "Reymen-AI-OPS-Platform", luego "Reymen") | **ReymenApp** → `ReymenSolutions/ReymenApp` |
| Nombre interno (código, paquete npm `reymenapp`, docs técnicas, scripts) | **ReymenApp** |
| Nombre que ve el cliente dentro de la app (títulos, correos, encabezados) | **Reymen Solutions** |
| Nombre del ícono en la pantalla de inicio (PWA / "Agregar a inicio") | **Reymen** |
| Repo y producto del punto de venta | **ReymenPOS** → `ReymenSolutions/ReymenPOS` |
| Logo de ReymenApp | "RM" (`src/app/icon.png`, `apple-icon.png`, `public/icons/icon-192/512.png`) |
| Logo de Reymen POS | "R." con punto naranja (`public/icons/*`, `public/favicon.ico`) |

Otros repos de la cuenta (no se tocaron): `ReymenSolutions/Reymen-Web` y `ReymenSolutions/Siena-Finance`.
**SmartCard** es otro proyecto (`reymen-smartcard`, con admin en `admin.reymen.mx` y tarjetas en `link.reymen.mx`). Su repo **no** estaba disponible en esta sesión; ReymenApp solo se conecta a su base de Supabase (ver §6).

---

## 2. Qué es cada sistema

- **ReymenApp** (`app.reymen.mx`): SaaS multi-cliente con Next.js 16, Prisma 6, PostgreSQL 16 y Tailwind v4. Tiene CRM, WhatsApp AI, automatizaciones (n8n), citas, plantillas y **Food** (restaurantes: menú, recetas, inventario, compras, ventas, operación en tiempo real y delivery). Hay un portal para cada cliente (`/portal/*`) y un admin de plataforma (`/admin/*`). Es la **fuente de verdad** de catálogo, precios, recetas e inventario.
- **ReymenPOS** (`pos.reymen.mx`): punto de venta PWA offline-first con Next.js 16 standalone. Los datos de cada caja viven en IndexedDB (Dexie) y el servidor del POS guarda un JSON por organización. Lee el menú de ReymenApp y le envía las ventas. Incluye mesas, cocina (KDS), cobro dividido, cortes e impresión de tickets. También hay una **app Android** (Capacitor) que abre `pos.reymen.mx` e imprime por USB en una Epson.
- **Cliente piloto:** **Villa Gardenia** (restaurante). Usa ReymenApp con Food + Reymen POS + SmartCard. Tablet: **Honor Pad X8a**. Impresora: **Epson TM-T20III por USB**. Por ahora **no hay cajón de dinero automático**.

---

## 3. Arquitectura e integración

```
 Caja (IndexedDB)                    Servidor ReymenPOS (pos.reymen.mx)           ReymenApp (app.reymen.mx)
 menú cada 60 s / al volver     ──►  GET  /api/menu?orgId  (x-api-key lectura) ──► GET  /api/v1/food/menu?orgId  (ETag/304)
 cola de ventas (~30 s)         ──►  POST /api/reymen/events (Bearer dispositivo) ► POST /api/webhooks/pos/orders  (HMAC)
 enlazar caja (una vez)         ──►  POST /api/devices/enroll   (código de enlace)
 personal + datos del ticket    ──►  POST /api/staff            (compartidos por organización)
 estado de cada caja            ──►  /api/devices/status, /api/ops/snapshot ◄──── ReymenApp "Operación" lee el snapshot
 dar de baja una caja           ──►  GET /api/devices, POST /api/devices/revoke
```

- Quien inicia es **siempre el POS**. ReymenApp solo conoce la URL del POS para el centro de operaciones (`REYMEN_POS_URL`, por defecto `https://pos.reymen.mx`; ver `src/lib/pos-operations.ts`).
- Menú: autenticación con `x-api-key` = `Organization.foodPosReadKey`. La respuesta trae ETag, platillos, variantes, modificadores, categorías y avisos de inventario (`stockStatus`, `lowStock`).
- Ventas: firma `x-reymen-signature: sha256=HMAC("<timestamp>.<rawBody>", Organization.n8nWebhookSecret)`, más `x-reymen-orgid`, `x-reymen-timestamp` (±5 min) y `x-reymen-event-id` (idempotencia). Una cancelación es el mismo evento con cantidades negativas.
- El webhook revisa los módulos `REYMEN_POS` y `FOOD_OPS` **antes** de registrar el `WebhookEvent`. Si no están activos responde 403 `pos_module_disabled`, el POS bloquea su cola con un aviso y reintenta. Así no se pierde la venta como "duplicada".
- Si ReymenApp o el internet se caen, el POS sigue vendiendo con su copia local y las ventas quedan pendientes hasta que vuelva la conexión.
- Contrato detallado: `ReymenPOS/docs/integration.md`.

Cómo se liga un POS a un cliente: Admin → Clientes → (cliente) → "Credenciales n8n" muestra el `orgId`, el secreto de webhook y la llave de lectura del POS. En el servidor del POS, la variable `REYMEN_ORGS` lleva `{ "<orgId>": { "webhookSecret": "...", "enrollmentCode": "..." } }`.

---

## 4. ReymenApp — qué hay (por área)

PRs fusionados en `main` (#1–#26). Cada PR tiene una descripción detallada en GitHub.

| PR | Qué |
|---|---|
| #1–#2 | Módulo Food, integración SmartCard, gestión de usuarios; parches de seguridad |
| #3 | Quita datos demo del dashboard Food; crea `deploy/update.sh` |
| #4 | Alta de usuarios única, ROI en USD, valores fijos centralizados, pruebas de citas, i18n |
| #5 | Errores visibles en producción (`UserError`), seguridad (cookie de impersonación firmada, acciones sin guard), precio Enterprise por cliente, tipo de cambio automático |
| #6–#8 | Food: módulo REYMEN_POS, inventario por receta (también por opción de modificador), compras, avisos de stock al POS; desactivar en vez de borrar lo que ya se vendió |
| #9 | Errores de formularios de Food como aviso en vez de tumbar la página |
| #10 | **Food → Operación**: centro de operaciones en tiempo real (lee `/api/ops/snapshot` del POS) |
| #11–#12 | Inventario: unidades de una lista; ingreso, producción, desecho y conteo en un paso; recetas más rápidas |
| #13 | **Food → Delivery**: tablero de pedidos de Uber Eats, Rappi y DiDi (`/api/webhooks/delivery/orders`, modelo de la migración `20261008090000_delivery_orders`). Faltan credenciales reales de los partners |
| #14, #21 | **Admin → Cliente → "Borrar ventas de prueba del POS"**: borra ventas POS en un rango, regresa inventario y reconstruye "Platillos más vendidos". Pide escribir BORRAR y queda en bitácora (`src/lib/food-purge.ts`) |
| #15–#18 | Renombres (ver §1) e ícono "RM" |
| #19 | Pantallas sin cortes en celular (PageHeader, diálogos con scroll, pestañas deslizables) |
| #20 | **Deslizar hacia abajo para actualizar** (`src/components/shared/PullToRefresh.tsx`, en PortalShell y AdminShell) |
| #21 | Modo oscuro legible: overrides en `src/app/globals.css` |
| #22–#26 | **SmartCard desde Admin** (ver abajo) |

### SmartCard (PRs #22–#26) — lo más reciente
- ReymenApp lee y escribe la base de Supabase de SmartCard con la llave de servicio (`src/lib/smartcard-supabase.ts`). Como esa llave **no tiene RLS**, cada consulta filtra explícitamente por empresa.
- El portal del cliente (`/portal/smartcard`, módulo `NFC_QR`) muestra el panel si `companies.external_org_id = <orgId de Reymen>` **y** el correo con el que entra la persona es miembro activo en `company_users`. Si no, muestra un aviso según el caso: "no está vinculada", "no es miembro activo" o "no configurado".
- **Admin → Clientes → (cliente) → tarjeta "SmartCard"** (`src/components/admin/SmartcardLinkPanel.tsx`, `src/lib/smartcard-link.ts`, `src/actions/admin/smartcard-link.ts`):
  - **Vincular** una empresa libre o con **vínculo roto** (su `external_org_id` apunta a un ID que no existe en Reymen). Nunca le quita una empresa a otro cliente que sí existe; el update es condicional.
  - **Dar / quitar acceso** a usuarios del propio cliente, con rol (owner/admin/manager/staff/agent). Crea o reutiliza el usuario de Supabase Auth.
  - **Desvincular**: la empresa, sus tarjetas y sus datos se quedan en SmartCard.
  - **Límite de integrantes**: se muestra el límite actual contra el del plan, con el botón "Aplicar límite del plan".
- **Admin → SmartCard** (menú lateral, `src/app/(admin)/admin/smartcard/page.tsx`): todas las empresas de SmartCard, su cliente en Reymen (o "sin vincular" / "vínculo roto"), cuántos miembros activos y cuántas tarjetas tiene cada una.
- **El límite de integrantes sigue al plan de Reymen:** Starter 2, Profesional 10, Enterprise sin límite (se quita la llave). Vive en `company_modules.limits.max_team_members` del módulo `smartcard` en Supabase. Se sincroniza:
  - al cambiar el plan desde Admin (`changePlan`);
  - cuando Stripe cambia el plan (pago, cambio o cancelación);
  - al vincular;
  - al abrir `/portal/smartcard`, que corrige el desfase si lo hay.
- En "Por tarjeta" del portal, la columna es **"Titular de la tarjeta"** (tabla `clients` de SmartCard, dentro de la misma empresa). No son otros clientes de Reymen.
- [?] No se vio el código de `check_limit()` de SmartCard. Si en Enterprise falla al invitar porque no hay llave de límite, cambiar "sin límite" por un número alto en `planMemberLimit()`.
- [D] Lo demás de `admin.reymen.mx` (crear empresas, perfiles, editar titulares de tarjetas, analítica) **no** está en ReymenApp. Para traerlo hace falta acceso al repo `reymen-smartcard`, para no adivinar el esquema.

### Reglas del código de ReymenApp (no romper)
- Todo export de `src/actions/*` (`"use server"`) es un endpoint público: siempre con guard (`requireAdmin`, `requireOrgPermission`, `requireFoodManager`).
- Mensajes de error para el usuario: `throw new UserError("...")`, con su traducción EN en `src/lib/server-messages.ts`. La prueba `src/lib/user-error.test.ts` falla si falta.
- `currentStock` solo cambia en `src/lib/food-inventory.ts`, siempre con `FoodInventoryMovement`.
- Lo que ya se vendió **no se borra, se desactiva** (platillos, variantes, opciones, grupos, insumos, proveedores).
- Editar platillos o grupos actualiza en su lugar (`matchExisting`), nunca con `deleteMany` + `create`.
- Las ventas con `source = POS` no se editan en el portal; las ventas de prueba se borran solo con la herramienta de Admin.
- Tailwind v4 con modo oscuro por clase `.dark`, que remapea variables de color en `globals.css`. Ahí están los ajustes de contraste.

---

## 5. ReymenPOS — qué hay

PRs fusionados en `main` (#1–#28):

| PR | Qué |
|---|---|
| #1 | PWA offline-first integrada con Reymen |
| #2–#5 | Despliegue en VPS (Docker, nginx-proxy en `proxy-net`, `deploy/update.sh`) |
| #6–#8 | PINs sin autocompletar; editar personal; **personal compartido entre cajas** y numeración C1, C2… |
| #9 | Firma `"<timestamp>.<body>"` |
| #10 | Ventas pendientes si el módulo está apagado; avisos de inventario en el menú (**solo aviso, nunca bloquea**) |
| #11 | Fechas y horas siempre en hora de México, no en la de la tablet |
| #12, #14 | **Mesas, modo cocina (KDS), cobro dividido**; liberar una mesa abierta por error |
| #13 | Estado de cada caja y snapshot para el centro de operaciones |
| #15 | Menú por categorías, tarjetas de cocina compactas, pestaña **Pedidos**, vista de celular |
| #16 | Impresión: `PrinterService`, ticket común (`ReceiptData`) y adaptadores (navegador / simulador) |
| #17, #20, #23 | **App Android (Capacitor 8)** en `android-app/` que abre `https://pos.reymen.mx`; workflow `.github/workflows/android.yml` que construye el **APK firmado** |
| #18 | Venta de mostrador: aviso de si el pedido se manda a cocina (`CounterKitchenHint`) |
| #19 | Impresión USB en Android: plugin nativo `ReymenPrinter` con Epson ePOS2 SDK (TM_T20, PC437) |
| #21 | Pie fijo del ticket: "Powered by Reymen / www.reymen.mx" |
| #22 | Datos del ticket (negocio) compartidos entre todas las cajas |
| #23 | **Dar de baja un dispositivo individual** (Admin → Dispositivos vinculados) |
| #24–#25 | Docs con el nombre ReymenApp |
| #26–#27 | Logo nuevo "R." y favicon con versión (service worker `VERSION = "v3"`) |
| #28 | Deslizar hacia abajo para actualizar (`src/components/PullToRefresh.tsx`) |

### Detalles importantes del POS
- **Personal y datos del ticket** se comparten por organización vía `/api/staff`. Una caja nueva de la misma organización los hereda. Una **sucursal** distinta hoy también los heredaría, porque el POS aún no conoce sucursales (pendiente, §9).
- **Dispositivos:** el token del dispositivo es HMAC (`POS_DEVICE_TOKEN_SECRET`). Al dar de baja una caja se guarda `revokedAt` y esa caja deja de sincronizar. Rotar `enrollmentCode` o el secreto desenlaza todas las cajas.
- **Impresión** (`docs/printing.md`): navegador (diálogo de impresión), simulador, o Android USB (plugin). En Chrome de Android no se puede imprimir sin diálogo; por eso existe la app Android.
- **App Android** (`docs/android.md`): el APK se descarga de GitHub Actions (artifact). La firma usa los secretos del repo `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (= `reymen-pos`) y `ANDROID_KEY_PASSWORD`. **Guarda un respaldo del keystore:** sin él no se pueden publicar actualizaciones sobre la app instalada. La app abre la web, así que los cambios del POS llegan sin reinstalar. Solo se reinstala si cambia algo nativo (impresión).
- La tablet se conecta a la impresora con **USB-C OTG** (adaptador USB-C → USB-A).

---

## 6. Variables de entorno (solo nombres)

**ReymenApp** (en el VPS: `.env.preview`):
`DATABASE_URL`, `AUTH_SECRET`/`NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` (= `https://app.reymen.mx`), `RESEND_API_KEY`, `EMAIL_FROM` (pendiente: "Reymen Solutions <…>"), `BANXICO_TOKEN` (opcional), `MXN_PER_USD` (respaldo), `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PROFESSIONAL`, `STRIPE_PRICE_ENTERPRISE`, `CRON_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (SmartCard), `SMARTCARD_PUBLIC_URL` (default `https://link.reymen.mx`), `REYMEN_POS_URL` (default `https://pos.reymen.mx`), `LOGIN_IP_RATE_LIMIT`, `TZ=America/Mexico_City`, Sentry (`SENTRY_*`), n8n (`N8N_*`), `POSTGRES_*`.

**ReymenPOS** (`.env` junto a `docker-compose.yml`, plantilla `deploy/env.example`):
`REYMEN_API_URL`, `REYMEN_ORGS` (JSON en una línea), `POS_DEVICE_TOKEN_SECRET` (≥ 32 caracteres), `POS_DATA_DIR`, `POS_DOMAIN`, `LETSENCRYPT_EMAIL`, `NEXT_PUBLIC_SW_DEV`.

---

## 7. Despliegue (VPS)

- **ReymenApp:** carpeta `/home/emilianorm/reymen-ai-ops-preview` (dueño `emilianorm`); compose local del servidor `docker/docker-compose.preview.yml` (no está versionado). Comando, en una línea:
  ```
  R=/home/emilianorm/reymen-ai-ops-preview; sudo -u emilianorm -H git -C $R pull --ff-only && sudo $R/deploy/update.sh
  ```
  `update.sh` exige `main`, construye la imagen, detecta migraciones pendientes, respalda la base con `pg_dump` antes de migrar, aplica `prisma migrate deploy` y espera `/api/health`.
- **ReymenPOS:** carpeta `~/reymen-pos`. Comando: `cd ~/reymen-pos && ./deploy/update.sh` (exige `main` y espera a que `reymen-pos` quede `running / healthy`). Guía: `docs/deploy-vps.md`.
- Si `docker` da "permission denied", usar `sudo`.
- [D] **Pendiente del usuario:** apuntar el remoto del VPS al nombre nuevo del repo:
  ```
  sudo -u emilianorm -H git -C /home/emilianorm/reymen-ai-ops-preview remote set-url origin https://github.com/ReymenSolutions/ReymenApp.git
  ```
  GitHub redirige el nombre viejo, pero conviene actualizarlo.
- [?] No se confirmó qué versión está desplegada hoy. En la última captura del usuario faltaban #24–#26, así que hay que correr el `update.sh` de ReymenApp.

---

## 8. Decisiones tomadas (no reabrir sin preguntar)

1. ReymenApp es la fuente de verdad; el POS solo lee el catálogo y envía ventas.
2. **Nunca bloquear ventas por inventario.** Los avisos de stock son solo avisos ("Con el aviso está bien, no modifiques eso"). Solo bloquea el "agotado" manual del POS.
3. Lo vendido se desactiva, no se borra. El recálculo por receta es manual y desde una fecha.
4. El módulo `REYMEN_POS` bloquea la captura manual de ventas, y el webhook lo revisa antes de registrar el evento.
5. Errores de Server Actions con `UserError` y su traducción EN.
6. Enterprise tiene precio pactado por cliente (`customMonthlyPriceUsd`); el checkout en línea es solo para Profesional.
7. Producción siempre desde `main` por PR, con squash merge.
8. Nombres según §1.
9. SmartCard: el límite de integrantes = límite de usuarios del plan de Reymen, porque cada integrante también es usuario del portal.
10. Sin cajón de dinero automático por ahora.
11. **Sucursales en el POS: pendiente por decisión del usuario.** No implementarlas sin que lo pida.
12. Impresión desde iPad: solo fue una pregunta, no se hizo nada.

---

## 9. Pendientes

**Del usuario (operativos):**
- [D] Desplegar ReymenApp en el VPS para que entren los PRs #22–#26 (SmartCard). El POS ya tiene #28; si no, correr también su `update.sh`.
- [D] Después de desplegar: Admin → Clientes → **Villa Gardenia** → tarjeta **SmartCard**. Si sigue sin vincular, elegir "Villa Gardenia · vínculo roto" → **Vincular**, y luego **Dar acceso** a `villagardenia@hotmail.com` (Dueño) y `villagardeniaoficial@gmail.com`. Al abrir SmartCard como Villa Gardenia debe decir **2 / 10 integrantes** (plan Profesional).
- [D] Admin → Clientes → Villa Gardenia → "Borrar ventas de prueba del POS": usar **"Limpiar platillos registrados"** con un rango que empiece el primer día de pruebas, para que "Platillos más vendidos" quede limpio.
- [D] Cambiar el remoto del VPS a `ReymenApp` (§7).
- [D] `EMAIL_FROM` con el nombre visible "Reymen Solutions <…>".
- [D] Respaldar el keystore del APK en un lugar seguro y borrar `~/reymen-firma` del VPS.
- [D] Dar de baja en el POS el dispositivo del emulador de pruebas (Admin → Dispositivos vinculados).
- [D] Actualizar Ubuntu del VPS (la versión actual llegó a fin de soporte).
- [D] Probar el ticket real en la TM-T20III (acentos, márgenes, corte) y mandar foto.
- [D] Si en VG-TEST-03 se quiere otro titular en lugar de "Consultorio 2", cambiarlo en `admin.reymen.mx`.

- [D] **Respaldo fuera del servidor (decidido por el usuario: al final de las fases del CRM).** `deploy/update.sh` ya respalda la base solo antes de cada migración (`backups/antes-de-migrar-*.dump`, en el mismo servidor); eso protege de una migración fallida, no de perder el servidor. Al terminar las fases: copiar el respaldo MÁS RECIENTE (`ls -lt backups/`) fuera del VPS (`scp usuario@IP:/home/emilianorm/reymen-ai-ops-preview/backups/<archivo>.dump .`) y borrar los viejos de `backups/` para no llenar el disco. Hasta entonces los datos viven en un solo lugar (riesgo aceptado).
- [D] Desplegar lo que ya está en `main` del CRM (#37 incluye migración, #38–#40 y esta fase): ver `docs/crm/ROADMAP-CRM.md`.

**De desarrollo:**
- [D] **CRM:** roadmap de 9 mejoras en `docs/crm/ROADMAP-CRM.md` (hechas 1, 2, 3, 5, 6, 7; faltan 4, 8, 9). Opciones para investigar después (CRM a medida por cliente, temas por cliente): `docs/futuro/CRM-A-MEDIDA-Y-TEMAS.md`.
- [D] **Automatizaciones (motor de eventos + n8n):** arquitectura **aprobada** en `docs/automations/ARQUITECTURA.md` (ReymenApp). Decisiones del usuario y orden de PRs en su **§K**; el siguiente paso exacto está al final de §K (PR 1: `Customer` en ReymenApp). Alcance agregado: descuentos en el POS y eventos de cocina y cierre de turno hacia Reymen. Aviso de privacidad pendiente: hasta tenerlo, solo dry-run y alertas internas.
- [D] Sucursales en el POS (en pausa por decisión del usuario).
- [D] Delivery: conectar con credenciales reales de Uber Eats, Rappi y DiDi (dependen de los partners).
- [D] Traer a ReymenApp el resto del admin de SmartCard (requiere el repo `reymen-smartcard`).
- [?] Confirmar el comportamiento de `check_limit()` de SmartCard con Enterprise (§4).
- Mejora menor sugerida: en "Por tarjeta" del portal SmartCard, el estado sale en crudo (`ACTIVE`); se podría traducir.

---

## 10. No hacer

- No bloquear ventas por inventario. No borrar catálogo con historial. No editar ventas POS desde el portal.
- No mover el chequeo de `REYMEN_POS` al procesamiento del evento.
- No crear Server Actions sin guard. No lanzar `Error` genérico para mensajes al usuario.
- No desplegar ramas `claude/*`. No hacer `git push --force` a `main`.
- En producción: nada de `prisma migrate reset`, `prisma db push` ni `docker compose down -v`.
- No commitear secretos (`.env*`, `REYMEN_ORGS`, llaves, keystore).
- Con la llave de servicio de SmartCard, cada consulta debe filtrar por empresa o usuario (no hay RLS).
- No quitarle a otro cliente una empresa de SmartCard ya vinculada; solo se reparan vínculos rotos.
- No implementar sucursales, cajón de dinero ni impresión en iPad sin que el usuario lo pida.

---

## 11. Cómo trabajar en local (lo que funcionó en esta sesión)

**ReymenApp:**
- Postgres local; se apaga solo de vez en cuando, levantarlo con `service postgresql start`. Base `reymen_ops_dev`; las pruebas usan su propia base (ver `vitest.setup.ts`).
- Usuarios del seed: admin `admin@reymen.io` / `admin123456`; cliente `carlos@clinicasanrafael.com` / `client123456`. El login tiene límite por IP: si falla, esperar unos 65 s.
- Build: `AUTH_SECRET=... AUTH_TRUST_HOST=true NEXTAUTH_URL=http://localhost:3000 AUTH_URL=http://localhost:3000 npx next build`. Si el CSS se ve viejo, `rm -rf .next`.
- Checks: `npx tsc --noEmit -p .`, `npx eslint src`, `npx vitest run` (575 pruebas en verde al cierre). El CI corre `lint-typecheck-test-build` y `e2e` (Playwright).
- SmartCard en local: un Supabase falso en Node (responde `/rest/v1/<tabla>` y `/auth/v1/admin/users`, con ids de usuario UUID) más `SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=fake`.
- Para habilitar módulos en local: insertar en `OrganizationModule` (`module`, `status = 'ACTIVE'`, `source = 'ADMIN_GRANTED'`).

**ReymenPOS:**
- Servidor local: copiar `public` y `.next/static` al standalone, luego `REYMEN_ORGS='{"org1":{"webhookSecret":"wh","enrollmentCode":"enroll-code-123"}}' POS_DATA_DIR=... POS_DEVICE_TOKEN_SECRET=<32+ chars> PORT=3100 node .next/standalone/server.js`.
- Checks: `npx tsc --noEmit`, `npx eslint`, `npx vitest run`. Android: el workflow corre las pruebas JUnit del plugin y construye el APK.
- `AGENTS.md`: Next.js 16 tiene cambios incompatibles con versiones anteriores; leer `node_modules/next/dist/docs/` antes de usar APIs nuevas.

**Truco de entorno:** `pkill -f "next start"` puede matar el propio shell. Mejor matar por PID (`pgrep -f ...` y `kill <pid>`).

---

## 12. Exactamente dónde nos quedamos

- Todo está fusionado en `main` en ambos repos: ReymenApp hasta **#26** y ReymenPOS hasta **#28**. No hay PRs abiertos ni ramas con trabajo sin fusionar.
- Lo último que se hizo fue la serie de SmartCard (#22–#26): vincular desde Admin, reparar vínculos rotos, página Admin → SmartCard, columna "Titular de la tarjeta", y el límite de integrantes atado al plan (Admin, Stripe y al abrir SmartCard).
- Lo siguiente que toca es del usuario: desplegar ReymenApp y vincular Villa Gardenia (§9). Si algo falla, pedirle una captura: el mensaje exacto de SmartCard indica qué paso falta.
