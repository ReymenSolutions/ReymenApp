# Apple Wallet y Google Wallet (tarjeta de Lealtad)

La tarjeta de lealtad se puede guardar en Apple Wallet y Google Wallet. El pase
muestra las visitas, la recompensa y el mismo QR de la tarjeta web, y se
actualiza solo cuando el cliente suma una visita o canjea.

La fuente de verdad sigue siendo la base de Reymen. Si el cliente borra el pase
o cambia de teléfono, no pierde nada: lo vuelve a agregar desde su tarjeta.

Cada proveedor se activa solo cuando sus variables están en el `.env` del
servidor. Sin ellas, el botón dice "Próximamente" y todo lo demás funciona igual.

## Cómo funciona

| | Apple Wallet | Google Wallet |
|---|---|---|
| Botón en la tarjeta | descarga `/lealtad/<negocio>/tarjeta/<token>/wallet/apple` (.pkpass firmado) | `/…/wallet/google` crea el pase en Google y abre "Guardar en Google Wallet" |
| Actualización | el iPhone se registra en `/api/wallet/apple/v1/…`; al cambiar el progreso se le avisa por APNs y descarga el pase nuevo | se actualiza el objeto en la API de Google y el teléfono lo refleja |
| Cuándo | al registrar visita o canje en caja: al instante. Ventas del POS y cancelaciones: en el siguiente ciclo de automatizaciones (5 min) | igual |

Código: `src/lib/loyalty/wallet-apple.ts`, `wallet-google.ts`, `wallet-sync.ts`, `wallet-data.ts`.

Requisito: `NEXT_PUBLIC_APP_URL` debe ser la URL pública con https (`https://app.reymen.mx`).
Apple solo habla con servicios https.

## Apple Wallet

Necesitas una cuenta del **Apple Developer Program** (de pago, anual).

Lo más fácil es hacer los pasos de `openssl` en el VPS (Linux ya lo trae).

1. En developer.apple.com → Certificates, Identifiers & Profiles → **Identifiers** → `+` →
   **Pass Type IDs**. Identificador sugerido: `pass.mx.reymen.lealtad`.
2. Genera la solicitud de certificado (CSR):
   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout pass.key -out pass.csr \
     -subj "/CN=Reymen Lealtad/emailAddress=tu-correo@reymen.mx/C=MX"
   ```
3. En el Pass Type ID → **Create Certificate** → sube `pass.csr` → descarga `pass.cer`.
4. Arma el `.p12` (certificado + llave) con una contraseña:
   ```bash
   openssl x509 -inform der -in pass.cer -out pass.pem
   openssl pkcs12 -export -inkey pass.key -in pass.pem -out pass.p12 -passout pass:UNA_CLAVE
   ```
5. Descarga el certificado intermedio de Apple **WWDR G4**
   (https://www.apple.com/certificateauthority/AppleWWDRCAG4.cer) y conviértelo:
   ```bash
   openssl x509 -inform der -in AppleWWDRCAG4.cer -out wwdr.pem
   ```
6. Variables en el `.env` del servidor:
   ```bash
   APPLE_WALLET_PASS_TYPE_ID="pass.mx.reymen.lealtad"
   APPLE_WALLET_TEAM_ID="ABCDE12345"            # Team ID, arriba a la derecha en developer.apple.com
   APPLE_WALLET_CERT_P12_BASE64="$(base64 -w0 pass.p12)"
   APPLE_WALLET_CERT_PASSWORD="UNA_CLAVE"
   APPLE_WALLET_WWDR_PEM_BASE64="$(base64 -w0 wwdr.pem)"
   ```
   (Pega el resultado de cada `base64 -w0 …`, no el comando.)
7. Reinicia con `deploy/update.sh`. Borra `pass.key`, `pass.p12` y `pass.csr` del servidor
   cuando ya estén en el `.env`.

El certificado del pase vence cada año: renuévalo con los pasos 2 a 4 y cambia
`APPLE_WALLET_CERT_P12_BASE64`. Los pases ya instalados siguen funcionando.

## Google Wallet

1. En **Google Pay & Wallet Console** (pay.google.com/business/console) crea la cuenta de
   emisor (Wallet API). Copia el **Issuer ID**.
2. En **Google Cloud Console**: crea un proyecto (o usa uno), habilita **Google Wallet API**,
   crea una **cuenta de servicio** y descarga su llave **JSON**.
3. De regreso en Pay & Wallet Console → **Usuarios**: invita el correo de la cuenta de
   servicio (`…@….iam.gserviceaccount.com`) con acceso de **Desarrollador**.
4. Variables en el `.env` del servidor:
   ```bash
   GOOGLE_WALLET_ISSUER_ID="3388000000012345678"
   GOOGLE_WALLET_SERVICE_ACCOUNT_JSON="$(base64 -w0 llave.json)"
   ```
5. Reinicia con `deploy/update.sh`.

**Modo de prueba:** al principio la cuenta de emisor está en modo demo y solo las cuentas
de Google que agregues como usuarios de prueba pueden guardar el pase. Para abrirlo a todos,
en la consola pide **acceso de publicación** (Google revisa un ejemplo del pase; tarda unos días).

El logo del pase es el logo del negocio (si tiene uno con https) o el ícono de la tarjeta
en su color, que se sirve desde `/api/wallet/logo/<programa>`.

## Probar

1. Inscríbete en un programa y abre tu tarjeta.
2. iPhone: "Agregar a Apple Wallet" → Agregar. Android: "Agregar a Google Wallet" → Guardar.
3. Registra una visita en caja: el pase cambia a "1/N" en segundos (en iPhone llega
   una notificación "Llevas 1/N visitas").
