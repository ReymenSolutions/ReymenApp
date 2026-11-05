# Avisos push en el celular y la computadora

Reymen avisa al instante, aunque la app esté cerrada:

| Aviso | A quién |
|---|---|
| Recordatorio de una tarea (a la hora elegida) | Responsable de la tarea |
| Te asignaron una tarea | La persona asignada (no si te la asignas tú) |
| Mensaje nuevo de un cliente (WhatsApp, Instagram, Messenger, chat…) | Responsable de la conversación; si no tiene, dueño, admins, gerentes y agentes |
| Lead nuevo que llega solo (Meta Lead Ads, formularios, n8n) | Dueño, admins y gerentes |

Los avisos de una misma conversación o tarea se reemplazan en lugar de amontonarse. Al tocar uno se abre la pantalla correspondiente.

## Activarlo en el servidor (una sola vez)
1. Generar las llaves: `npx web-push generate-vapid-keys`.
2. Ponerlas en `.env.preview` del VPS: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` y `VAPID_SUBJECT="mailto:tu-correo"`.
3. `./deploy/update.sh`.

Sin llaves no cambia nada: el botón no aparece y la campana y los correos siguen funcionando.

## Activarlo en cada dispositivo
- **Android / computadora (Chrome, Edge, Firefox)**: campana 🔔 → «Recibir avisos en este dispositivo» → Permitir.
- **iPhone (iOS 16.4 o más)**: abrir Reymen en Safari → Compartir → «Agregar a pantalla de inicio» → abrir Reymen desde ese ícono → campana → «Recibir avisos…» → Permitir.
- Cada dispositivo se activa por separado. Para dejar de recibirlos: campana → «Desactivar avisos en este dispositivo».

## Técnico
- Web Push estándar con VAPID (`web-push`); `public/sw.js` solo muestra avisos (no guarda la app en caché).
- Dispositivos en `PushSubscription` (uno por navegador; si otra persona inicia sesión en ese navegador, pasa a ella). Los que el servicio push ya no reconoce (404/410) se borran solos; tras 10 fallas seguidas también.
- Código: `src/lib/push.ts`, `src/app/api/push/subscribe/route.ts`, `src/components/shared/PushOptIn.tsx`.
