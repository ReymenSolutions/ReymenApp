# REYMEN SmartCard — Fase 10: Ajustes

> Continúa de `FASE9.md` (Fase 9, usuarios administrativos). Este documento cubre `/settings` -- gestionar los tres catálogos del sistema (themes, tipos de destino, slugs reservados) desde el panel en vez de solo por SQL/seed. No hay migraciones SQL nuevas -- las tres tablas ya existían desde Fase 2, junto con su RLS.

## 1. Qué se construyó

- **Temas** (`/settings/themes/new`, `/settings/themes/[id]`) -- crear y editar themes con un formulario de tokens controlados (colores, layout, radio de bordes, tipografía, fondo oscuro), nunca un campo de JSON libre.
- **Tipos de destino** -- editar el nombre visible y activar/desactivar un tipo, más dar de alta uno nuevo, todo inline dentro de `/settings` (no necesita pantallas propias, son formularios chicos).
- **Slugs reservados** -- agregar y quitar entradas, también inline.
- Los tres viven en una sola pantalla (`/settings`) en vez de rutas separadas por catálogo -- a diferencia de clientes/perfiles/tarjetas, estos son catálogos chicos (4 themes, 7 tipos de destino, ~25 slugs en el seed), no listas que crecen sin límite ni necesitan búsqueda/paginación.

## 2. Por qué esta pantalla sí es visible para los 3 roles (a diferencia de Fase 9)

`/users` (Fase 9) es exclusiva de SUPERADMIN porque la propia policy `admin_profiles_select` ya limita a ADMIN/VIEWER a ver solo su propia fila -- nunca la de otro admin. Los tres catálogos de esta fase son distintos: `themes_select`, `destination_types_select` y `reserved_slugs_select` (todas desde `rls_policies.sql`, Fase 2) le dan lectura completa a SUPERADMIN, ADMIN y VIEWER por igual -- el propio comentario original de la policy de themes lo dice: "los 3 roles pueden leerlos para asignarlos a un perfil". Por eso `/settings` sigue el mismo patrón que clientes/perfiles/tarjetas (los 3 roles ven la pantalla completa, solo SUPERADMIN ve los botones de editar/agregar) en vez del patrón exclusivo de `/users`.

## 3. Por qué editar un tipo de destino no deja tocar `requires_profile`/`requires_url`

Esos dos campos son los que lee `validate_card_destination()` (el trigger de Fase 2 que valida cada tarjeta) para decidir si esa tarjeta necesita `profile_id`, `destination_url`, o ninguno. Cambiarlos en un tipo que ya tienen tarjetas existentes las dejaría en un estado que el propio trigger podría rechazar en su siguiente edición, sin ningún aviso en el momento del cambio. `label`, `is_active` y `sort_order` son seguros de editar siempre porque no alimentan esa validación. Si de verdad se necesita una combinación de reglas distinta, el camino seguro es dar de alta un tipo de destino nuevo (el formulario de "+ Agregar tipo" sí pide `requires_profile`/`requires_url`, porque ahí no hay tarjetas existentes que puedan quedar en un estado inconsistente).

## 4. La whitelist de `themes.config` es una decisión de esta fase, no algo que ya existiera

El comentario original de la columna (`themes.config`, Fase 2) pedía "tokens seguros únicamente... jamás CSS/HTML arbitrario" pero nunca fijó qué valores exactos son válidos para `layout`, `font` o `border_radius`. `apps/admin/lib/theme-config.ts` fija esa whitelist con los valores que ya usan los 4 themes sembrados (`minimal`, `corporate`, `real_estate` de layout; `sm`/`md`/`lg` de radio; `inter` como única tipografía por ahora) -- nada inventado, pero tampoco es una lista cerrada para siempre: como `apps/public` (que es quien en algún momento va a leer estos valores para de verdad renderizar un perfil) sigue siendo un scaffold, agregar una opción nueva aquí no rompe nada pero tampoco hace nada visible todavía. Cuando `apps/public` exista de verdad, esta whitelist es el primer lugar a revisar si hace falta un layout o tipografía nueva.

## 5. Qué queda fuera de esta fase, a propósito

- **Borrar un theme o un tipo de destino** -- ninguno de los dos se puede eliminar del todo, solo desactivar, mismo principio de "nunca borrado físico" del resto del panel. `reserved_slugs` es la única excepción real (sí tiene botón de eliminar) porque no es una entidad de negocio con historial -- es literalmente una lista de palabras prohibidas, sin nada que perder si una entrada se quita.
- **Vista previa visual de un theme** -- el formulario muestra los colores como swatches (círculos), pero no un mockup del perfil real con ese theme aplicado. Tiene sentido una vez que `apps/public` exista.
- **Reordenar tipos de destino arrastrando** -- el campo `sort_order` se edita como número al crear, no hay drag-and-drop.

## 6. Instrucciones de uso

### Paso 1 -- Descomprime el zip encima de tu proyecto

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase10-settings.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- No hace falta tocar Supabase

Sin migraciones nuevas otra vez.

### Paso 3 -- Reinicia el panel

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npm run dev --workspace=apps/admin
```

### Paso 4 -- Prueba el flujo (con tu cuenta SUPERADMIN)

1. Entra a `/settings` desde el menú ("Ajustes").
2. Confirma que ves los 4 themes del seed, los 7 tipos de destino y ~25 slugs reservados.
3. Crea un theme nuevo (`/settings/themes/new`) -- elige colores, layout, etc. y guarda. Confirma que aparece en la lista con sus swatches de color.
4. Entra a ese theme y desactívalo -- confirma que el badge cambia a "Inactivo" y que, si vas a `/profiles/new`, ya no aparece como opción.
5. En "Tipos de destino", cambia el nombre visible de uno existente (por ejemplo, de "WhatsApp" a "WhatsApp Business") y guarda sin recargar la página completa.
6. Da de alta un tipo de destino nuevo (ej. código `TIKTOK`, con "requiere URL" marcado) -- confirma que aparece en la lista y que, al crear una tarjeta nueva en `/cards/new`, ya sale como opción.
7. Agrega un slug reservado nuevo (ej. `blog`) y confirma que si intentas crear un perfil con ese slug en `/profiles/new`, se rechaza.
8. Elimínalo de la lista de reservados y confirma que ahora sí se puede usar ese slug.

### Paso 5 -- Confirma los 3 roles

Entra con una cuenta ADMIN o VIEWER -- ambas deben ver `/settings` completo (a diferencia de `/users`, que ni siquiera les aparece en el menú), pero sin ningún botón de editar/agregar/eliminar.

### Paso 6 -- Confirma la auditoría

```sql
select action, entity_type, before_data, after_data, occurred_at
from audit_logs
where entity_type in ('theme', 'destination_type', 'reserved_slug')
order by occurred_at desc;
```

## 7. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/admin` compila sin errores de TypeScript y genera las 3 rutas nuevas (`/settings`, `/settings/themes/new`, `/settings/themes/[id]`) además de todas las de fases anteriores (21 en total).
- No se pudo correr esto contra un Supabase real desde este entorno -- pruébalo tú siguiendo la sección 6.
