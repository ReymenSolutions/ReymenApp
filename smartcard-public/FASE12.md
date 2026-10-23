# REYMEN SmartCard — Fase 12: Código QR

> Continúa de `FASE11.md` (Fase 11, `apps/public`). Este documento cubre la pieza que faltaba para que el flujo QR fuera real de punta a punta: `/q/{code}` ya sabía qué hacer con un scan desde Fase 11, pero no existía nada que generara la **imagen** del código -- ni en el panel, ni para imprimir en la tarjeta física. No hay migraciones SQL nuevas.

## 1. Qué se construyó

- **`GET /cards/{id}/qr`** (`apps/admin`) -- genera el PNG del QR de esa tarjeta al vuelo, codificando `{PUBLIC_SITE_URL}/q/{card_code}`. Sin `?download=1` responde igual pero sin `Content-Disposition`, pensado para usarse directo en un `<img src="...">`; con `?download=1` fuerza la descarga con el nombre `{card_code}.png`.
- **Vista previa en `/cards/[id]`** -- una miniatura del QR junto a la URL exacta que codifica y el link de descarga, justo debajo del código de la tarjeta.
- **`generateCardQrPng()` y `buildCardQrTargetUrl()`** en `@reymen/lib` -- la generación en sí vive en el paquete compartido, no en `apps/admin`, por si `apps/public` u otra pieza futura también la necesita (por ejemplo, una página de "imprime tu QR" de cara al cliente final).

## 2. Por qué el QR se genera en el servidor, no con una librería de cliente

Mismo principio que todo el tracking de clics de Fase 11 (`FASE11.md` sección 3): nada de JavaScript en el navegador para algo que el servidor puede resolver solo. La librería `qrcode` (pura en JS, sin dependencia de `canvas` nativo ni de nada que no compile en cualquier entorno Node) genera el PNG directo en el Route Handler -- el navegador solo pide una imagen, como pediría cualquier `<img>` normal. Esto también significa que el botón "Descargar QR" funciona aunque quien lo use tenga JavaScript desactivado, y que no hay que instalar nada del lado del cliente ni preocuparse por compatibilidad de navegador.

## 3. Por qué el QR codifica `/q/{code}` y no `/n/{code}`

`ARCHITECTURE.md` (sección 5, "flujo de resolución NFC/QR") ya distingue los dos canales físicos desde el diseño original: NFC se programa directo en el chip de la tarjeta (un paso de aprovisionamiento aparte, fuera del alcance de esta fase), y QR es literalmente una imagen que alguien escanea con la cámara -- son entradas físicas distintas al mismo backend (`resolveCardScan()`, Fase 11), pero cada una necesita su propio artefacto. Esta fase solo resuelve la mitad que faltaba: la imagen. Programar el chip NFC de una tarjeta física sigue siendo un paso manual (con la app del fabricante del chip, apuntando a `{PUBLIC_SITE_URL}/n/{card_code}`), no algo que este panel pueda hacer por software.

## 4. De dónde sale `PUBLIC_SITE_URL` -- por qué no se puede derivar como `ADMIN_URL`

`getAdminUrl()` (Fase 9) deriva la URL del propio panel a partir del `host` del request entrante, porque el panel se está sirviendo a sí mismo -- tiene sentido. Pero el QR necesita la URL de **otra** app del monorepo (`apps/public`, puerto 3000), que corre en un origen completamente distinto al panel (puerto 3001): no hay ningún request de `apps/public` del que derivar nada desde dentro de `apps/admin`. Por eso `getPublicSiteUrl()` (`apps/admin/lib/public-site-url.ts`) es más simple -- solo lee `PUBLIC_SITE_URL` del entorno, con `http://127.0.0.1:3000` como valor por defecto para desarrollo local. En producción, esta variable **sí hay que definirla** al dominio real del sitio público (`.env.example` ya lo documenta) -- si se te olvida, el QR seguiría generándose, pero apuntando a `127.0.0.1:3000`, que nadie fuera de tu máquina puede abrir.

## 5. Qué queda fuera de esta fase, a propósito

- **Aprovisionar el chip NFC físico** -- ver sección 3. Sigue siendo un paso manual con la app del fabricante de las tarjetas NFC.
- **Plantilla de impresión** (el QR ya centrado en un diseño de tarjeta física, con logo, nombre, etc.) -- esta fase entrega el PNG del QR solo, a 512×512px con margen de silencio incluido (el espacio en blanco alrededor que necesita cualquier lector de QR) -- suficiente para pegarlo en un diseño externo (Canva, Illustrator, lo que uses para mandar a imprimir), pero no genera esa plantilla.
- **QR en `apps/public`** -- por ejemplo, para que un cliente final descargue su propio QR desde su perfil. `generateCardQrPng()` ya vive en `@reymen/lib` pensando en esto, pero no se conectó ahí porque no fue pedido.
- **Elegir el nivel de corrección de errores** -- queda fijo en `M` (15% de tolerancia), el nivel por defecto recomendado para uso general impreso. Solo haría falta subirlo a `H` si en algún momento se decide superponer un logo encima del QR (con `M` un logo grande puede dejarlo ilegible).

## 6. Instrucciones de uso

### Paso 1 -- Descomprime el zip encima de tu proyecto

```powershell
Expand-Archive -Path "$env:USERPROFILE\Downloads\reymen-smartcard-fase12-qr.zip" -DestinationPath "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard" -Force
```

### Paso 2 -- Instala dependencias (la librería `qrcode` es nueva)

```powershell
cd "C:\Users\JOSE EMILIANO\Proyectos\reymen-smartcard"
npm install
```

### Paso 3 -- No hace falta tocar Supabase

Sin migraciones nuevas esta vez.

### Paso 4 -- Arranca los dos apps (igual que en Fase 11)

```powershell
# Terminal 1
npm run dev --workspace=apps/admin
```

```powershell
# Terminal 2
npm run dev --workspace=apps/public
```

### Paso 5 -- Prueba el QR

1. En el panel, entra al detalle de cualquier tarjeta (`/cards/{id}`).
2. Debajo del código, debe verse una miniatura del QR, la URL que codifica (algo como `http://127.0.0.1:3000/q/REY-000003`) y un link "Descargar QR (PNG)".
3. Da clic en "Descargar QR (PNG)" -- debe bajar un archivo `REY-000003.png` (con el código real de esa tarjeta).
4. Con el celular (en la misma red WiFi que tu máquina, o usando la IP de tu red en vez de `127.0.0.1` -- tu celular no puede resolver `127.0.0.1` como tu propia PC), escanea ese QR con la cámara -- debe abrir el perfil, igual que si hubieras tecleado la URL a mano.
5. Si no tienes forma de probarlo desde el celular ahora mismo, basta con confirmar que la imagen se ve como un QR válido y que la URL de abajo es la correcta.

## 7. Cómo se validó esto desde este entorno

- `npm run build --workspace=apps/admin` compila sin errores y genera la ruta nueva (`/cards/[id]/qr`), 22 rutas en total.
- `npm run build --workspace=apps/public` se volvió a correr después de agregar la dependencia nueva a `@reymen/lib` -- sigue compilando limpio, mismas 8 rutas de Fase 11.
- Se generó un PNG de prueba directamente con la librería (`qrcode.toBuffer`) y se confirmó que el archivo resultante empieza con la firma binaria real de un PNG -- no se pudo escanear con una cámara real desde este entorno, pruébalo tú siguiendo la sección 6.
