# REYMEN SmartCard — Fase 14: Subir fotos/logos

> Continúa de `FASE13.md` (Fase 13, recuperación de contraseña). Este documento cubre subir la foto y el logo de un perfil como archivo, en vez de pegar una URL a mano -- lo que `ARCHITECTURE.md` (línea 51, "Storage: fotos, logos") y el propio comentario que traía `apps/admin/app/profiles/[id]/page.tsx` desde la Fase 6 ("subir el archivo desde aquí llega en una fase posterior") ya dejaban anotado.

## 1. Qué se construyó

- **Bucket de Supabase Storage `profile-media`** (migración nueva, `supabase/migrations/20260910120001_profile_media_storage.sql`) -- público para lectura, restringido para escritura a SUPERADMIN+ADMIN, límite de 5 MB por archivo, solo PNG/JPG/WEBP.
- **Sección "Foto y logo"** en `/profiles/[id]` -- reemplaza el texto "subir el archivo llega en una fase posterior" por dos bloques (uno por foto, uno por logo) con: miniatura de la imagen actual (o "Sin imagen"), selector de archivo + botón "Subir"/"Reemplazar", y un botón "Quitar" cuando ya hay una imagen puesta.
- **Los campos de texto "URL de foto" / "URL de logo" se quedan** -- ahora como una segunda forma de asignar la imagen (pegar una URL de algo ya alojado en otro lado), no la única. Subir un archivo sobrescribe automáticamente lo que haya en ese campo.
- **Dos Server Actions nuevas** (`apps/admin/app/profiles/[id]/media-actions.ts`): `uploadProfileMediaAction` (valida tipo/tamaño, sube a Storage, guarda la URL pública en `profiles.photo_url`/`logo_url`, audita el cambio) y `removeProfileMediaAction` (borra el objeto de Storage y limpia la columna).

## 2. Por qué la ruta del archivo no lleva extensión

`{profileId}/photo` y `{profileId}/logo` -- sin `.jpg`/`.png` al final, siempre el mismo nombre, con `upsert: true`. La alternativa (guardar `{profileId}/photo-<timestamp>.jpg`) deja un archivo huérfano en el bucket cada vez que alguien reemplaza la foto -- nadie los borra nunca, y con cientos de perfiles eso se vuelve espacio de Storage desperdiciado sin ningún beneficio. Con una ruta fija, la segunda subida simplemente reemplaza a la primera.

Que el archivo no tenga extensión no afecta cómo el navegador lo muestra: Storage guarda el `Content-Type` real que se le manda en la subida (`contentType: file.type`, ya sea `image/png`, `image/jpeg` o `image/webp`) y lo sirve en el header HTTP correspondiente -- eso es lo que decide cómo se renderiza una imagen, no la terminación de la URL.

## 3. Por qué la URL lleva `?v=<timestamp>`

Como la ruta es siempre la misma (`{profileId}/photo`), reemplazar la foto no cambia la URL -- y eso significa que la caché del navegador (o de cualquier CDN de por medio) podría seguir enseñando la imagen vieja después de subir una nueva, sin que refrescar la página lo arregle. Agregar `?v=<hora en que se subió>` no cambia el archivo real, solo hace que cada subida nueva tenga una URL distinta que nadie tenía en caché todavía -- fuerza a pedirla de nuevo. Es el mismo truco de "cache busting" que ya usan prácticamente todos los sitios que sirven imágenes con nombre fijo.

## 4. Por qué el bucket es público (para lectura)

`profile_media_select` en la migración permite `select` a cualquiera (`using (bucket_id = 'profile-media')`), y el bucket mismo se crea con `public = true`. Esto es intencional, no un descuido: la foto y el logo de un perfil los tiene que poder ver cualquier visitante de `link.reymensolutions.mx/<slug>` sin sesión -- es exactamente la misma exposición pública que ya tenían cuando `photo_url`/`logo_url` eran una URL externa cualquiera pegada a mano. Lo que sí queda protegido es la escritura (`insert`/`update`/`delete`), igual que cualquier otro campo de un perfil.

## 5. Por qué la sección de subida está fuera del `<form>` principal

`/profiles/[id]` ya tenía un formulario grande (`<form action={updateProfileAction}>`) que guarda todos los campos del perfil de un solo golpe. Un `<input type="file">` necesita que su `<form>` tenga `encType="multipart/form-data"` -- y un `<form>` no puede anidarse dentro de otro `<form>` sin que el navegador rompa la serialización de los dos (el HTML nunca permitió `<form>` dentro de `<form>`). Por eso "Foto y logo" es su propia sección con sus propios formularios pequeños e independientes, cada uno con su propio botón -- subir una foto no depende de haber llenado (ni de guardar) el resto del formulario del perfil, y viceversa.

## 6. Qué queda fuera de esta fase, a propósito

- **Recorte/redimensionado de la imagen en el navegador** -- se sube el archivo tal cual el usuario lo eligió (hasta 5 MB). No se agregó ningún editor de imagen ni compresión del lado del cliente -- eso necesitaría JavaScript en el navegador, algo que este proyecto viene evitando fase tras fase a propósito (revisa `ARCHITECTURE.md`).
- **Miniaturas/variantes de tamaño** (por ejemplo, una versión chica para la lista de perfiles). Solo se guarda el archivo original -- si el catálogo de perfiles llega a necesitar miniaturas, es una fase aparte (transformaciones de imagen de Supabase Storage, o generarlas al subir).
- **Historial de imágenes anteriores.** Cada subida reemplaza a la anterior sin dejar rastro descargable -- `audit_logs` sí registra que se subió/quitó una foto o logo (con la URL nueva), pero no guarda el archivo viejo en ningún lado.
- **Perfiles nuevos (`/profiles/new`)** -- sigue sin tener campos de foto/logo, ni de texto ni de archivo, porque ese formulario crea el perfil, y la ruta de Storage necesita el `id` del perfil (que no existe todavía en ese punto). Subir la imagen sigue siendo un paso que se hace después, ya en `/profiles/[id]`, igual que ya pasaba con las URL de texto desde la Fase 6.

## 7. Instrucciones de uso

### Paso 1 -- Descomprime el zip encima de tu proyecto

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase14-media.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- Aplica la migración nueva

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npx supabase db reset
```

(`db reset` vuelve a correr todas las migraciones desde cero contra tu Supabase local, incluida la nueva `20260910120001_profile_media_storage.sql` -- es la misma forma en que aplicaste las migraciones de fases anteriores. Si prefieres no perder datos de prueba que ya tengas, usa `npx supabase migration up` en su lugar, que solo corre la migración nueva.)

### Paso 3 -- Reinicia el panel

```powershell
npm run dev --workspace=apps/admin
```

(No cambió ningún archivo `.env` ni ninguna dependencia de `package.json` en esta fase -- no hace falta `npm install` ni reiniciar Supabase.)

### Paso 4 -- Prueba subir una foto y un logo

1. Entra a cualquier perfil (`/profiles/<id>`) con una cuenta SUPERADMIN o ADMIN.
2. Baja hasta la sección "Foto y logo" (queda entre el formulario grande y "Links del perfil público").
3. En "Foto", elige un archivo PNG o JPG de tu computadora y da clic en "Subir". La página debe recargar mostrando "Cambios guardados" y la miniatura con tu imagen.
4. Repite con "Logo".
5. Abre la página pública del perfil (`link.reymensolutions.mx/<slug>` o `127.0.0.1:3000/<slug>` en local) y confirma que la foto/logo nuevos aparecen ahí.
6. Vuelve a `/profiles/<id>` y da clic en "Reemplazar" en la foto, sube una imagen distinta -- confirma que la miniatura cambia (no que se queda pegada la vieja).
7. Da clic en "Quitar" en el logo -- confirma que la miniatura vuelve a "Sin imagen" y que el campo de texto "URL de logo" también queda vacío.
8. Prueba subir un archivo que no sea imagen (por ejemplo un `.pdf`) -- debe rechazarlo con el mensaje "debe ser PNG, JPG o WEBP", sin guardar nada.
9. Con una cuenta VIEWER, entra al mismo perfil -- la sección "Foto y logo" no debe mostrar ningún botón de subir/quitar, solo las miniaturas (si ya hay imágenes puestas).

## 8. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/admin` compila sin errores de TypeScript, genera las 22 rutas existentes (ninguna ruta nueva -- todo pasa por Server Actions dentro de `/profiles/[id]`, que ya existía).
- `npm run build --workspace=apps/public` sigue compilando sin cambios -- esta fase no tocó `apps/public`.
- No se pudo probar la subida real contra un Supabase corriendo, ni verificar el bucket/las políticas de Storage, desde este entorno -- pruébalo tú siguiendo la sección 7.
