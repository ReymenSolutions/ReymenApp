# Remediación de dependencias — 29 octubre 2026

## Cambio
Se actualizan Next a 16.4.3, Sentry a 10.78.0, node-forge a 1.4.2, sharp a 0.35.5 y dependencias transitivas del lockfile. Zod pasa a 4.6.7; deepmerge-ts se fuerza a ^8.0.0 mediante override para el árbol de Prisma, manteniendo Prisma 6.19.3 y sin migración del esquema.

No se usa zod/v3 para aparentar una corrección: se migra a la API v4. Errores de validación usan issues, records declaran clave string, formularios preservan coerción numérica y automatizaciones inspeccionan límites/enums mediante la API actual. Se añade prueba de rechazo de arrays sobredimensionados antes de validar sus elementos (el caso relacionado con el aviso de agotamiento de memoria).

## Verificación
253 archivos / 1,778 pruebas aprobados, incluido Wallet con certificados sintéticos. Build y tipos aprobados. Lint: cero errores y 65 advertencias preexistentes. Prisma generate y migrate deploy comprobados exclusivamente en una base local nueva, reymen_remediation_test. Un primer intento falló porque el contenedor de pruebas estaba detenido; otro reveló fixtures sobrantes de una ejecución interrumpida. El resultado final se obtuvo en una base nueva, sin borrar bases reales ni alterar expectativas de Wallet.

npm audit --omit=dev: cero avisos conocidos tras actualización; no equivale a ausencia de vulnerabilidades desconocidas. Se conservan los resultados JSON y pruebas en remediation-20261029/.

## POS y despliegue
La autorización de personal se corrige en ReymenPOS PR #50. Toda publicación de personal o datos de ticket exige el código de enlace del negocio. El token de dispositivo solo permite descargar personal; los cambios offline esperan autorización explícita. Leer la documentación POS antes de actualizar cajas. Revisar administradores existentes: el arreglo no deshace cambios históricos no autorizados.

No hay nuevas migraciones de este cambio, ni despliegue ejecutado. Los scripts de actualización existentes pueden aplicar otras migraciones pendientes en el VPS; comprobar respaldo y versión actual primero.

## Límites de auditoría y rollback
No se ha completado el escaneo exhaustivo: start_codex_security_deep_scan no está disponible. La habilidad Deep Security Scan exige detener ese flujo cuando falta el servidor del plugin; la revisión manual y la corrección validada no sustituyen el escaneo.

Queda identificado el control de autorización de /api/devices/revoke del POS para una remediación separada. Los equipos offline siguen siendo dispositivos de confianza, con hashes de PIN locales. No se certifica todo el producto ni la infraestructura del VPS.

Revertir estas actualizaciones reintroduce avisos conocidos; preferir una corrección hacia adelante. No borrar bases, volúmenes ni historial. No se necesita restauración de datos por estas modificaciones de código/dependencias.

Navegador local: 13/13 escenarios Chromium aprobados sobre el build nuevo, cubriendo CRM, Foods, Loyalty y móvil. La prueba no sustituye Safari, impresoras ni aceptación del VPS.
