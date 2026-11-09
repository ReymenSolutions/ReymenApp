# Ambiente de prueba (apptest / postest)

Una copia completa de Reymen y del POS para probar cambios **antes** de llevarlos a producción. Corre en el mismo
VPS, pero con su propia base, sus propios contenedores y sus propias llaves.

| | Producción | Prueba |
|---|---|---|
| Reymen | `app.reymen.mx` · `reymen-ai-ops-preview` | `apptest.reymen.mx` · `reymen-test-app` |
| POS | `pos.reymen.mx` · `reymen-pos` | `postest.reymen.mx` · `reymen-pos-test` |
| Base | `reymen-ai-ops-preview-postgres` | `reymen-test-postgres` |
| Carpeta | `/home/emilianorm/reymen-ai-ops-preview` | `/home/emilianorm/reymen-test/app` y `/pos` |
| Qué rama | siempre `main` | la que quieras probar |

## Qué la hace segura

- **Nada sale hacia afuera.** `.env.test` no tiene llaves de correo, push, Wallet, Stripe, SmartCard ni IA de pago,
  y n8n apunta a ningún lado. Los correos solo llegan a quienes pongas en `TEST_EMAIL_ALLOWLIST`.
- **La copia de producción se limpia antes de abrirse** (`prisma/sanitize-test.ts`):
  - teléfonos y correos de contactos, clientes, Lealtad y proveedores se cambian por ficticios;
  - las automatizaciones quedan en pausa y los canales de WhatsApp/Meta apagados;
  - las llaves de cada negocio son nuevas;
  - todos los usuarios entran con la contraseña de prueba;
  - se conservan nombres, menú, ventas e historial.
- **A producción solo se le lee.** El clon usa `pg_dump`; los scripts se niegan a correr en la carpeta de producción
  y la limpieza se niega a correr contra la base de producción.
- **Franja amarilla «AMBIENTE DE PRUEBA»** en todas las pantallas, y «PRUEBA ·» en el título de la pestaña.

## Instalación (una sola vez)

1. **DNS:** registros `A` de `apptest` y `postest` hacia la IP del VPS.
2. **Copias del código** (se clonan con las mismas llaves de GitHub que producción):

```bash
P=/home/emilianorm; PROD=$P/reymen-ai-ops-preview; POSPROD=$(ls -d /home/*/reymen-pos | head -1); O=$(stat -c %U $POSPROD)
sudo -u emilianorm -H mkdir -p $P/reymen-test
sudo -u emilianorm -H git clone "$(sudo -u emilianorm -H git -C $PROD remote get-url origin)" $P/reymen-test/app
sudo -u $O -H git clone "$(sudo -u $O -H git -C $POSPROD remote get-url origin)" /tmp/reymen-pos-test && sudo mv /tmp/reymen-pos-test $P/reymen-test/pos
```

3. **Llaves de prueba, primer despliegue y clon de producción:**

```bash
T=/home/emilianorm/reymen-test; sudo $T/app/deploy/test/init.sh && sudo $T/app/deploy/test/update.sh main && sudo $T/pos/deploy/test-update.sh main && sudo $T/app/deploy/test/clone-prod.sh
```

Al final aparecen los **códigos de enlace del POS de prueba**: se usan en `postest.reymen.mx` → Admin → Conexión.
La contraseña para entrar a `apptest.reymen.mx` con cualquier usuario:

```bash
sudo grep TEST_PASSWORD /home/emilianorm/reymen-test/app/.env.test
```

## Uso diario

| Para | Comando |
|---|---|
| Probar una rama en Reymen | `sudo /home/emilianorm/reymen-test/app/deploy/test/update.sh claude/la-rama` |
| Probar una rama en el POS | `sudo /home/emilianorm/reymen-test/pos/deploy/test-update.sh claude/la-rama` |
| Refrescar los datos con una copia nueva de producción | `sudo /home/emilianorm/reymen-test/app/deploy/test/clone-prod.sh` |
| Volver a `main` en prueba | los mismos comandos con `main` |

Flujo de un cambio: PR → se despliega su rama en prueba → se revisa en `apptest` / `postest` → se fusiona a `main` →
se despliega a producción con `deploy/update.sh` (sin cambios).

## POS de prueba en una tablet

El APK de producción abre siempre `pos.reymen.mx`. Para probar el POS:

- **en el navegador:** `https://postest.reymen.mx` (todo menos imprimir por USB);
- **con impresora:** un APK de prueba que abra `postest.reymen.mx` («Reymen POS Prueba»), instalado solo en la tablet de pruebas.

## Notas

- Las migraciones de una rama se aplican **solo** a la base de prueba. Si después regresas a una rama sin esa
  migración, refresca con `clone-prod.sh`.
- El ambiente de prueba no tiene reloj (cron): los recordatorios y seguimientos no corren solos ahí.
- Los textos de las conversaciones se copian tal cual (sin teléfonos ni correos): da acceso a prueba solo a quien
  ya ve producción.
