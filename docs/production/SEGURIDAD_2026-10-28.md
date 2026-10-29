# Revisión de seguridad y bloqueos de release — 28 octubre 2026

## Dictamen
NO APTO PARA APROBAR PRODUCCIÓN. Revisión manual acotada a fronteras App/POS/Foods/Loyalty y consulta del registro npm. No es un escaneo exhaustivo del repositorio; el ejecutor del plugin y referencias obligatorias no están disponibles. No se probaron ataques contra el VPS ni datos reales.

## SEC-01 — Alta: un dispositivo POS puede alterar administradores
Confirmado localmente. Requiere token válido de un dispositivo enlazado, no acceso anónimo. `ReymenPOS/src/app/api/staff/route.ts` autentica el dispositivo y comprueba revocación, pero llama `mergeStaff` sin acreditar a un administrador. `src/lib/server/store.ts` acepta role admin, hash y salt proporcionados por el cliente y aplica el registro nuevo o más reciente. Las operaciones de política y canje consultan posteriormente ese mismo almacén.

Prueba: con datos temporales y token sintético se envió un registro nuevo role=admin a POST /api/staff, sin credencial de empleado. Respuesta 200 con el administrador activo. Suite temporal de staff: 10/10 aprobadas, incluida demostración del fallo. Se restauró el archivo de pruebas original; no se publicó una prueba que espere el comportamiento vulnerable como contrato permanente.

Impacto: un usuario con control del navegador de una caja enlazada puede introducir credenciales elegidas por él y eludir la separación de roles del servidor. No prueba acceso entre organizaciones ni conocimiento del secreto HMAC de App. Los PIN cortos y sus hashes distribuidos para operación offline son otra limitación de confianza del dispositivo.

Corrección requerida antes del release: autoridad administrativa comprobada server-side para altas, roles, PIN y desactivaciones; bootstrap de primer administrador explícito y protegido; separar sincronización de lectura y cambios autorizados; definir cómo se autorizan cambios offline sin confiar en roles enviados por el cliente. Agregar pruebas negativas y de concurrencia. No se modifica precipitadamente este contrato porque rompería la sincronización de personal existente. Estado: ABIERTO.

## SEC-02 — Dependencias con avisos conocidos
`npm audit --omit=dev --json` consultado el 28 octubre 2026, lockfiles actuales.
- App: 10 paquetes afectados (2 critical, 7 high, 1 moderate).
- POS: 3 paquetes afectados (1 critical, 2 high).
Son severidades del registro, NO diez/tres explotaciones demostradas. Incluyen dependencias transitivas y herramientas Prisma instaladas como productivas.

Next, Sentry (App), node-forge (App), sharp, source-map-js, deepmerge-ts, fast-uri y zod requieren revisión y actualización. El registro ofrece Next 16.4.3 para POS; migrar Zod a v4 supone cambio mayor. No ejecutar `npm audit fix --force` en producción. Actualizar en ramas específicas, revisar uso de funcionalidades afectadas y repetir tipos/build/pruebas/navegador. Los JSON de evidencia conservan avisos, rangos y enlaces del registro. Estado: ABIERTO, exposición individual pendiente de validar.

## Controles inspeccionados
- API de menú App: llave por organización activa, comparación de secretos y módulo FOOD_OPS; no acepta org arbitraria desde sesión.
- Webhooks App: firma/timestamp por organización, comprobación de organización activa y módulos; órdenes exigen identificador de evento.
- POS gateway: firma en servidor, asociación org/dispositivo, verificación de revocación y destino desde configuración server-side.
- Loyalty POS: PIN server-side para política/canje, pero depende del almacén vulnerable de SEC-01.
- Limitador POS: memoria por proceso y reinicio de mapa al exceder 10.000 claves; no equivale a cuota distribuida durable.

## Cobertura no realizada
Auditoría de todas las rutas, dependencias explotables una por una, infraestructura/proxy real, pruebas de intrusión, secretos del VPS, Wallet con credenciales reales, Safari y hardware. No declarar estos puntos aprobados ni confundir las pruebas funcionales con seguridad completa.

## Seguimiento 29 octubre
SEC-01 corregido en POS #50 (autorización de propietario para publicar personal); SEC-02 remediado en la rama App codex/security-remediation-20261029 y POS #50. Ver REMEDIACION_2026-10-29.md para evidencia y limitaciones. La cobertura exhaustiva e infraestructura siguen pendientes; estos cierres no equivalen a certificación global.
