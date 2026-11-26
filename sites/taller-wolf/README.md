# Taller Wolf — sitio v8

La fuente del sitio es el ZIP v8 entregado por el cliente. `v8/` es el sitio estático completo; `herramientas/paginas-v8.js` genera los nueve HTML y `v8/assets/i18n-en.js`. `v0`–`v7` no se importaron. No edites los HTML generados directamente.

Desde esta carpeta:

```bash
node herramientas/paginas-v8.js v8
```

`v8/assets/app.js` contiene las interacciones y envía el formulario a `POST /api/workshop/public/inquiries` en el mismo origen. El endpoint crea una solicitud y un Lead CRM para la organización fijada por el servidor; no crea una cotización con precio ni identifica a un cliente por teléfono sin verificación. WhatsApp queda disponible como contacto alternativo.

El servidor del sitio debe servir `v8/` como raíz y pasar únicamente `/api/workshop/public/inquiries` al ReymenApp correspondiente. El ejemplo de Nginx está en `docker/nginx.wolf-site.conf`. El servicio opcional `wolf-site` de `docker/docker-compose.test.yml` usa el perfil `workshop-wolf` y exige autenticación básica con un archivo privado `.wolf-site.htpasswd` en la raíz del repo de test; el script lo crea con permisos de lectura para el grupo del proceso Nginx y no debe subirse a Git. Configura en la app de **test** `WORKSHOP_WOLF_LANDING_ENABLED=true`, `WORKSHOP_WOLF_ORG_ID` con el ID real de la organización de prueba que tenga `WORKSHOP`, y `WORKSHOP_WOLF_SITE_ORIGIN=https://<dominio-test>`; configura `TEST_WOLF_DOMAIN` en el entorno de Compose. Requiere DNS y TLS del proxy externo. No actives esta compuerta en producción hasta completar las pruebas de aceptación.

En el VPS de prueba, el script `deploy/test/configure-wolf-site.sh` verifica que el DNS del subdominio apunte a la misma IP que `apptest.reymen.mx`, lista las organizaciones Wolf de **test**, exige que `WORKSHOP` esté activo para el ID elegido, solicita una contraseña privada, guarda la configuración de forma atómica y arranca `wolf-site`. Ejemplo:

```bash
sudo /home/emilianorm/reymen-test/app/deploy/test/update.sh codex/workshop-wolf-site-crm
sudo /home/emilianorm/reymen-test/app/deploy/test/configure-wolf-site.sh wolftest.reymen.mx
```

Primero crea el registro DNS `A` de `wolftest.reymen.mx` hacia la IP de `apptest.reymen.mx`. El script no modifica producción ni configura `tallerwolf.com`.

Prueba desde el dominio de test: envío válido, resultado en CRM y solicitud del vehículo, reintento de la misma solicitud sin duplicado, error de red conservando el formulario, origen distinto rechazado, y vista en español/inglés y móvil. El consentimiento opcional de recordatorios solo queda registrado como evidencia de preferencia; **no habilita aún envíos automáticos**. La identidad del responsable y un correo de privacidad siguen pendientes de confirmación en el aviso legal.
