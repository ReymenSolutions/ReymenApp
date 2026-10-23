# REYMEN SmartCard — Fase 7: Tarjetas

> Continúa de `FASE6.md` (Fase 6, perfiles). Este documento cubre el tercer módulo de datos del panel: alta, listado, edición y baja de tarjetas (SmartCards), el objeto que en el mundo real trae el NFC/QR impreso. No hay migraciones SQL nuevas -- `cards` y `destination_types` ya existían desde Fase 2.

## 1. Qué se construyó

- **Listado de tarjetas** (`/cards`) -- tabla con búsqueda por código (`REY-000001`) y, opcionalmente, filtrado por cliente (mismo patrón que perfiles). Solo tarjetas no dadas de baja.
- **Alta de tarjeta** (`/cards/new`, o `/cards/new?client_id=...` desde "+ Nueva tarjeta" en el detalle de un cliente) -- cliente (obligatorio), tipo de destino (obligatorio), y el campo correcto según ese tipo (perfil digital o URL). El código de la tarjeta **nunca se pide** -- lo genera Postgres.
- **Detalle y edición** (`/cards/[id]`) -- el código se muestra pero no se puede editar; el resto de los campos sí, incluido el destino.
- **Baja y reactivación** (soft delete, solo SUPERADMIN) -- mismo patrón que clientes y perfiles.
- **Auditoría con un matiz nuevo**: cambiar el destino de una tarjeta queda registrado como `card.destination_changed` en vez de un `card.updated` genérico -- ver sección 3.

## 2. El campo que cambia según el tipo de destino

`cards.destination_type` determina si la tarjeta necesita un perfil (`PROFILE`) o una URL (`GOOGLE_REVIEWS`, `WHATSAPP`, `INSTAGRAM`, `MAPS`, `WEBSITE`, `CUSTOM_URL`) -- nunca ambos, nunca ninguno. Esa regla ya vivía en la base de datos desde Fase 2 (`validate_card_destination()`, un trigger que consulta `destination_types.requires_profile`/`requires_url` en vez de tener la regla hardcodeada -- así que agregar un tipo de destino nuevo en el futuro es un `INSERT` en esa tabla, no una migración de esta pantalla).

`apps/admin/app/cards/CardDestinationFields.tsx` es el único Client Component nuevo de esta fase (y, junto con `InviteFragmentHandler.tsx` de Fase 4, de todo el panel) -- muestra el selector de perfil o el campo de URL según lo que el admin elija en "Tipo de destino", sin recargar la página. Es la única pantalla donde se justificó JavaScript de cliente: la alternativa (mostrar los dos campos siempre, dejar que el trigger rechace la combinación equivocada) confunde más de lo que ahorra evitar unas líneas de React.

Si aun así se manda una combinación inválida (por ejemplo, alguien edita el HTML a mano, o hay una condición de carrera), el trigger la rechaza igual y `apps/admin/lib/db-errors.ts` traduce el mensaje (`card_needs_profile`, `card_no_profile_allowed`, `card_needs_url`, `card_no_url_allowed`) -- la validación real sigue siendo la de Postgres, la UI es solo la primera capa.

## 3. Por qué `card.destination_changed` y no siempre `card.updated`

`ARCHITECTURE.md` sección 1 es explícita: el mecanismo central de todo el producto es poder cambiar a dónde apunta una tarjeta física **sin volver a programar el chip ni reimprimir el código**. Ese cambio en particular es el más importante que puede pasar en esta tabla -- mucho más que, digamos, editar una nota interna. Por eso `apps/admin/app/cards/[id]/actions.ts` compara `destination_type`/`profile_id`/`destination_url` antes y después, y si alguno cambió, usa la acción `card.destination_changed` en vez de `card.updated` genérico. Es exactamente el ejemplo que ya sugería el comentario de `audit_logs` desde Fase 2 (`"ej. card.destination_changed, profile.updated, client.created"`) -- ahora existe de verdad.

## 4. Qué queda fuera de esta fase, a propósito

- **Imprimir/generar el código QR o programar el NFC** -- esta fase solo administra el registro en base de datos. La generación visual del QR (`packages/lib`, mencionado en `ARCHITECTURE.md` sección 8) es una fase de utilidades separada.
- **Analítica de escaneos** (`/analytics`, cuántas veces se usó cada tarjeta) -- la tabla `events` ya existe desde Fase 2 y ya se llena vía `log_event()`, pero no hay pantalla todavía. Es la fase que sigue después de esta.
- **Las rutas públicas `/n/{code}` y `/q/{code}`** (`apps/public`) -- ya tienen su función lista del lado de la base de datos (`get_card_for_redirect()`, Fase 2), pero la ruta que realmente resuelve el escaneo real de una tarjeta sigue siendo un scaffold. Sin esa ruta, el módulo de tarjetas de esta fase gestiona el dato pero todavía no hay nada que "atienda" un escaneo real.

## 5. Instrucciones de uso

### Paso 1 -- Descomprime el zip encima de tu proyecto

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase7-cards.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- No hace falta tocar Supabase

Igual que Fase 6, no hay migraciones nuevas. Si Supabase ya está corriendo, no hagas nada; si no:

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npx supabase start
```

### Paso 3 -- Reinicia el panel

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npm run dev --workspace=apps/admin
```

(Detén primero el que ya tuvieras corriendo con `Ctrl+C` en esa terminal.)

### Paso 4 -- Prueba el flujo completo (con tu cuenta SUPERADMIN)

1. Entra a `/clients`, abre el detalle de un cliente y da clic en "+ Nueva tarjeta".
2. Elige "Perfil digital" como tipo de destino -- debe aparecer el selector de perfiles (con el nombre del cliente entre paréntesis). Elige uno de los que creaste en Fase 6 y guarda.
3. Confirma que el código se generó solo (`REY-000003` o el siguiente que toque, ya que `REY-000001` y `REY-000002` los usa el seed).
4. Crea una segunda tarjeta, esta vez con "Google Reviews" o "WhatsApp" como destino -- confirma que ahora aparece el campo de URL en vez del selector de perfil.
5. Entra al detalle de esa segunda tarjeta y cambia su destino a otro tipo (por ejemplo de WhatsApp a Sitio web) -- guarda.
6. Revisa `audit_logs` (ver Paso 6) y confirma que ese cambio quedó como `card.destination_changed`, no `card.updated`.
7. Da de baja una tarjeta y reactívala desde su misma URL.

### Paso 5 -- Confirma los tres roles

Igual que en fases anteriores: ADMIN puede crear/editar pero no ve "Dar de baja esta tarjeta"; VIEWER ve todo con los campos deshabilitados.

### Paso 6 -- Confirma la auditoría

```sql
select action, entity_type, entity_id, before_data, after_data, occurred_at
from audit_logs
where entity_type = 'card'
order by occurred_at desc
limit 10;
```

## 6. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/admin` compila sin errores de TypeScript y genera las 3 rutas nuevas (`/cards`, `/cards/new`, `/cards/[id]`) además de todas las de Fases 4, 5 y 6.
- No se pudo correr contra un Supabase real desde este entorno -- pruébalo tú siguiendo la sección 5.
