# 20 — Staging privado de Mark

Se prepara un entorno separado para el proveedor elegido, **Anthropic**. En esta etapa no se añade su clave ni se hacen llamadas pagadas. Mark conserva su sandbox con respuestas simuladas. El presupuesto de $25 diarios, $500 por ciclo mensual y $1 por turno sigue siendo una base interna pendiente de conectar al gateway; no se presenta como protección de llamadas reales.

## Separación y alcance

- Checkout independiente; nunca copiar `.env`, backups ni datos de producción.
- Proyecto Compose `reymen-mark-staging`, red interna y volumen propios. PostgreSQL sin puerto público; aplicación únicamente en `127.0.0.1:3301`.
- Sin conexión a las redes del proxy, n8n o POS y sin cron. La red interna bloquea salida externa de los contenedores. El navegador del operador aún puede solicitar recursos públicos de la interfaz, por ejemplo avatares.
- Secretos aleatorios exclusivos con permisos 0600. El Dockerfile específico excluye `.env*`, respaldos y claves del contexto. El servicio app no recibe las contraseñas de login ni credenciales de Anthropic.
- Bootstrap transaccional exclusivamente para una base nueva con host/usuario/nombre fijos. Crea «Reymen Piloto» y dos usuarios ficticios; rechaza una base con organizaciones o usuarios. Nunca actualiza contraseñas ni borra registros.
- No cambia código de negocio, esquema ni configuración de producción. Las migraciones existentes se ejecutan solamente sobre el nuevo servicio de staging.

La red interna, los flags apagados y la ausencia de claves son medidas complementarias. No habilitar salida a Internet ni incorporar una clave hasta completar la integración financiera, identidad CRM, control humano y entrega idempotente. Este entorno todavía no constituye el piloto conectado de Website Chat.

## Preparación en el VPS

Los comandos requieren Docker Compose v2 y OpenSSL. El usuario administrador puede ejecutarlos con sudo; el checkout queda a nombre de `emilianorm`. Primero confirmar recursos disponibles y que el puerto esté libre:

```bash
df -h /home/emilianorm
free -h
sudo ss -ltnp 'sport = :3301'
```

Una compilación de Next consume varios GB adicionales; los límites de memoria del Compose aplican a ejecución, no a compilación. No hacer prune ni detener servicios comerciales para ganar espacio. Si falta capacidad, usar un VPS separado para staging.

Después de que esta implementación esté integrada/publicada en la revisión que se vaya a probar, crear **una sola vez** el checkout separado:

```bash
sudo -u emilianorm git clone https://github.com/ReymenSolutions/ReymenApp.git /home/emilianorm/reymen-mark-staging
cd /home/emilianorm/reymen-mark-staging
sudo -u emilianorm git switch codex/mark-private-staging
sudo -u emilianorm git rev-parse HEAD
sudo -u emilianorm bash deploy/staging/init.sh
sudo bash deploy/staging/run.sh build
sudo bash deploy/staging/run.sh database
sudo bash deploy/staging/run.sh migrate
sudo bash deploy/staging/run.sh bootstrap
sudo bash deploy/staging/run.sh start
sudo bash deploy/staging/run.sh status
curl --fail http://127.0.0.1:3301/api/health
```

La rama permite validar este incremento antes de integrarlo. Al usar main después de una fusión, sustituir `git switch` por la revisión aprobada; verificar el hash. Si el checkout ya existe, no repetir clone ni init ni bootstrap. No ejecutar `deploy/update.sh`: es el actualizador de producción. No usar `prisma/seed.ts`, que crea otras cuentas de demostración. Ante un fallo, detenerse en ese paso; no continuar con start si migrate o bootstrap fallaron.

`init.sh` no sobrescribe un archivo existente. Para repetir el arranque tras reinicio bastan `database` y `start`; se conservan los datos. Para actualizar código de staging: revisar/pullar la revisión autorizada, ejecutar `build`, `stop`, `migrate`, `start`; nunca repetir bootstrap en la misma base.

## Acceso privado y validación

En una **terminal de tu computadora**, mantener abierto el túnel:

```bash
ssh -N -L 3301:127.0.0.1:3301 reynolrm@158.69.213.163
```

Abrir `http://localhost:3301` en el navegador de esa computadora. Esto no abre un dominio público ni modifica el proxy. Desde un teléfono se requiere una aplicación SSH con túneles locales o una computadora para esta validación; no publicar el puerto en todas las interfaces como alternativa.

Usuarios: `admin@staging.reymen.test` y `owner@staging.reymen.test`. Consultar **en privado** las contraseñas `STAGING_ADMIN_PASSWORD` y `STAGING_OWNER_PASSWORD` dentro de `.env.staging` en el VPS (por ejemplo, con `sudo less .env.staging`). No pegar ese archivo ni capturas de sus valores en el chat, tickets o logs.

Validar login en ambos roles, organización «Reymen Piloto», panel `/portal/ai-lab` con OWNER y sandbox simulado. Confirmar ausencia de clientes reales, canales conectados, automatizaciones y llamadas a Anthropic. Verificar que el dominio comercial y POS siguen respondiendo sin cambios. No usar `docker compose config` sin `--quiet` para compartir diagnósticos: la salida contiene secretos.

## Pruebas y rollback

Las pruebas de seguridad de configuración se ejecutan con `node --test deploy/staging/safety.test.mjs`; requieren Docker Compose, sin daemon para resolver YAML. Revisan destino del bootstrap, rechazo de configuración ajena, permisos 0600, no sobrescritura, red privada, puerto loopback y proveedor simulado.

Rollback operacional: `sudo bash deploy/staging/run.sh stop`. Solo detiene la app de staging. Para detener también su base, usar el Compose de staging con `stop`; conservar volumen y `.env.staging`. No ejecutar `down -v`, reset ni restauraciones sobre producción. Si una migración falla, conservar evidencia y resolver hacia adelante en esta base aislada.

## Siguientes gates

1. Confirmar recursos y validar staging con datos ficticios; decidir después la organización real del piloto.
2. Integrar reservas/costos por instancia y paso, conciliación de resultados inciertos y política explícita de modelo, tarifa y reintentos de Anthropic.
3. Conectar conocimiento publicado y CRM con identidad verificada; proteger turno, control humano y entrega única.
4. Preparar Website Chat privado con revisión humana obligatoria. Habilitar conectividad y claves de staging únicamente cuando esos controles estén probados.
