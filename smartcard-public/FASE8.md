# REYMEN SmartCard — Fase 8: Analítica

> Continúa de `FASE7.md` (Fase 7, tarjetas). Este documento cubre `/analytics`, la última pantalla de datos del panel. No hay migraciones SQL nuevas -- `events` ya existía desde Fase 2, junto con `log_event()`, la función que la llena.

## 1. Qué se construyó

- **Pantalla de analítica** (`/analytics`) -- de solo lectura, para los 3 roles por igual (SUPERADMIN, ADMIN, VIEWER). A diferencia de clientes/perfiles/tarjetas, aquí no hay ningún botón de crear/editar/borrar: esta pantalla no escribe nada en la base de datos, así que no hay `actions.ts`, no hay traducción de errores nueva y no hay entradas nuevas en `audit_logs`.
- **Filtros** -- por cliente (selector) y por rango de fechas (7 / 30 / 90 días / todo, por defecto 30). También se puede filtrar por una tarjeta específica desde el link "Ver analítica de esta tarjeta" que ahora aparece en el detalle de cada tarjeta (`/cards/[id]`).
- **Resumen**: eventos totales, escaneos (separados en NFC vs. QR), clics de contacto/enlaces, y contactos guardados (`save_contact`).
- **Desgloses**: por tipo de evento, por origen (NFC/QR/Directo), por tipo de dispositivo, tarjetas con más actividad, perfiles con más vistas, y una tabla de los 25 eventos más recientes.
- **`is_bot` se excluye siempre** de todo lo que se muestra -- es exactamente para lo que existe esa columna desde que se creó la tabla en Fase 2 (ver el comentario original en la migración `..._events.sql`).

## 2. Por qué esta pantalla no tiene permisos por rol

Todas las pantallas anteriores (clientes, perfiles, tarjetas) tienen una distinción SUPERADMIN/ADMIN/VIEWER porque son formularios que escriben datos. `/analytics` no escribe nada -- solo lee `events` -- y la policy de esa tabla (`events_select`, ya definida en Fase 2) ya le da lectura completa a los 3 roles por igual, porque la sección 19 del prompt original es explícita en que VIEWER también consulta analítica. No había ninguna decisión de permisos que tomar en esta fase.

## 3. Por qué la agregación se hace en la página y no con SQL agregado

`/analytics` trae los eventos del rango filtrado (tope de 2000 filas) y calcula los conteos (por tipo, por origen, por tarjeta, etc.) en el propio Server Component, en vez de pedirle a Postgres funciones de agregación por separado. A la escala de este producto (negocios chicos/medianos, cada uno con un puñado de tarjetas) es más simple mantener una sola consulta legible que varias funciones RPC nuevas solo para contar filas. Si el volumen de eventos crece mucho en el futuro, ese tope de 2000 y este enfoque son el primer lugar a revisar -- está señalado en el comentario del archivo.

## 4. Qué queda fuera de esta fase, a propósito

- **Gráficas** -- todo son números y tablas, ninguna librería de charts. Coherente con el resto del panel: JavaScript de cliente solo donde de verdad hace falta (la única excepción de todo el panel sigue siendo `CardDestinationFields.tsx` de Fase 7).
- **Exportar a CSV/Excel** -- no se pidió, no está.
- **Las rutas públicas reales** (`/n/{code}`, `/q/{code}`) que generarían estos eventos solos, sin necesidad de insertarlos a mano -- siguen siendo un scaffold, como ya se documentó en `FASE7.md` sección 4. Por ahora, para ver algo en esta pantalla hay que generar eventos de prueba a mano (paso 4 abajo).

## 5. Instrucciones de uso

### Paso 1 -- Descomprime el zip encima de tu proyecto

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase8-analytics.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- No hace falta tocar Supabase

Igual que Fases 6 y 7, no hay migraciones nuevas. Si ya lo tienes corriendo, no toques nada.

### Paso 3 -- Reinicia el panel

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npm run dev --workspace=apps/admin
```

(Detén primero el que ya tuvieras corriendo con `Ctrl+C` en esa terminal.)

### Paso 4 -- Genera algunos eventos de prueba

Como todavía no existe la ruta pública que los generaría sola, créalos a mano desde el SQL Editor de Supabase Studio (`http://127.0.0.1:54323` → SQL Editor):

```sql
select log_event('nfc_scan', 'NFC', p_card_code := 'REY-000001');
select log_event('profile_view', 'NFC', p_card_code := 'REY-000001');
select log_event('whatsapp_click', 'NFC', p_card_code := 'REY-000001');
select log_event('qr_scan', 'QR', p_card_code := 'REY-000002');
select log_event('google_reviews_redirect', 'QR', p_card_code := 'REY-000002');
select log_event('save_contact', 'DIRECT', p_profile_slug := 'maria-mendoza');
```

(`REY-000001` y `REY-000002` son las tarjetas que trae el seed; si ya creaste tarjetas propias en Fase 7, usa esos códigos en su lugar.)

### Paso 5 -- Revisa `/analytics`

1. Entra a `/analytics` desde el menú superior ("Analítica").
2. Confirma que aparecen las 6 filas de arriba: 3 eventos de `REY-000001` (María Mendoza / XYZ Inmobiliaria) y 3 de `REY-000002` / el perfil de María.
3. Prueba el filtro por cliente -- al elegir "María Mendoza" o "Cafetería ABC" (los del seed) deben quedar solo los eventos de las tarjetas/perfiles de ese cliente.
4. Prueba los filtros de rango de fechas (7 / 30 / 90 días / Todo) -- como los eventos se acaban de crear, deben verse en cualquiera de los rangos.
5. Desde el detalle de `REY-000001` (`/cards/...`), da clic en "Ver analítica de esta tarjeta" -- confirma que solo aparecen sus 3 eventos.
6. Confirma que ningún dato de esta pantalla se puede editar -- no hay ningún botón de guardar/borrar en toda la página, para ningún rol.

## 6. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/admin` compila sin errores de TypeScript y genera la ruta nueva (`/analytics`) además de las 14 de las fases anteriores (15 en total).
- No se pudo generar tráfico real ni correr esto contra un Supabase real desde este entorno -- pruébalo tú siguiendo la sección 5.
