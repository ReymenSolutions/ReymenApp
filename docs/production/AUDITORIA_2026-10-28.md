# Auditoría de preparación para producción — 28 de octubre de 2026

## Dictamen
VALIDACIÓN AUTOMATIZADA APROBADA; ACEPTACIÓN OPERATIVA PENDIENTE. Este documento no certifica producción. No se han modificado servidores, bases reales ni canales comerciales. Foods y Loyalty se revisan como módulos de ReymenApp, no como repositorios independientes.

## Base y alcance
ReymenApp: 45082ed50d0e92444e136593ba838239074d2b78 (main consultado en GitHub). ReymenPOS: b3d1fd8 (main consultado en GitHub). Ramas de trabajo: codex/production-audit-20261028 en ambos repositorios.

Se revisan compilación, tipos, lint, regresiones existentes, contratos de menú, ventas, clientes, canjes y aislamiento. Las pruebas automatizadas no sustituyen una aceptación visual y operativa en dispositivos reales.

## Correcciones de esta revisión
- APP-01: el endpoint autenticado src/app/api/v1/food/menu/route.ts emitía ETag sin una política explícita de caché. Se añade Cache-Control: private, no-cache y Vary: Cookie, X-Api-Key tanto a 200 como a 304. Permite revalidación del menú y evita autorizar su almacenamiento en cachés compartidas. Se conservan formato, precios, autenticación y ETag. Prueba de cabeceras añadida en route.test.ts. No se ha demostrado una filtración previa.
- POS-01: importación de tipo SaleDiscount sin uso en src/lib/events.ts. Eliminada; sin cambio de comportamiento. Lint posterior sin advertencias.

## Evidencia y entorno
- POS: 27 archivos / 215 pruebas aprobadas; typecheck aprobado; build aprobado con acceso a Google Fonts. El intento con red restringida falló al descargar Inter: dependencia externa de compilación, no fallo funcional demostrado.
- App: lint sin errores, 65 advertencias existentes. Migraciones aplicadas exclusivamente a PostgreSQL 16 local desechable reymen_audit_test.
- El primer intento de App usó node_modules y Prisma desactualizados tras cambiar a main; sus errores no se consideran defectos confirmados. Se reinstalan dependencias del lockfile y se genera cliente antes de repetir.

## Criterios pendientes de aceptación
1. Regresiones completas de App aprobadas: 252 archivos / 1,777 pruebas. Build final terminó con código 0 y comprobación de tipos aprobada. Durante generación estática se registraron consultas sin DATABASE_URL: validar esas páginas con configuración de staging antes de release.
2. Demostrar en staging el flujo venta → cliente CRM → visita del programa elegido → recompensa → canje único → cancelación y reversión.
3. Verificar cobro sin red y sincronización posterior sin duplicados, además de dos cajas concurrentes.
4. Validar menús/precios/sucursal/inventario en Foods y Apple/Google Wallet según credenciales reales disponibles.
5. Revisar navegación y checkout en Safari móvil y escritorio, con estados de carga, vacío y error.
6. Verificar copia de seguridad y restauración, migraciones pendientes y procedimiento de actualización de cada servidor antes de autorizar release.

## Rollback de estas correcciones
Revertir únicamente los cambios de esta rama y reconstruir la versión anterior. No hay migraciones nuevas ni necesidad de borrar datos.

## Presentación al cliente
Mostrar catálogo y sucursales; venta asociada a un cliente ficticio; historial CRM; programa seleccionado, progreso y recompensa; canje y prevención de duplicados. Explicar que la sincronización offline y el intervalo entre visitas afectan cuándo aparece una visita. No presentar IA privada de staging como canal comercial disponible. No anunciar certificación de producción hasta cerrar los criterios pendientes.

## Evidencia final y alcance de la afirmación
La suite completa ejecutó la prueba añadida para cabeceras. No hubo llamadas pagadas a IA ni migraciones reales. Playwright/Chromium: 13 escenarios aprobados sobre la compilación local. Sigue pendiente Safari/dispositivos reales y staging del VPS. No se realizó un escaneo exhaustivo de vulnerabilidades; las regresiones de permisos existentes no equivalen a una auditoría de seguridad completa. Las correcciones permanecen locales, sin despliegue.

## Continuación: navegador y cobertura de seguridad

13/13 escenarios de Chromium aprobados (40.7 s): conversión a contacto CRM; separación de gasto POS e importes manuales; historial individual y móvil; recetas por categoría; permisos de módulo; alta de programa; alta pública sin consentimiento de marketing implícito; selección de programa por miembro; consulta administrativa de programas históricos; recuperación idempotente de dos compras omitidas; móvil oscuro en inglés sin desbordamiento; navegación atrás; suspensión sin borrar miembros.

APP-QA-02: dos selectores de Playwright fallaban por textos duplicados en el DOM. Se sustituyen por enlace accesible y contenido dentro del main activo. No se usa first() para ocultar una duplicación funcional, ni se relajan resultados esperados. Archivos: e2e/customers.spec.ts y e2e/loyalty.spec.ts. Primera ejecución: 5 aprobados, 2 fallidos y 6 no ejecutados. Ejecución corregida: 13 aprobados. Esto corrige la automatización, no acredita un defecto funcional nuevo.

Bloqueo de escaneo: se pudo leer codex-security:security-scan/SKILL.md, pero sus referencias scan-prologue.md no estuvieron disponibles y no había herramientas de scan/preflight registradas. No se inició ni completó un escaneo formal. No se presenta un informe de seguridad generado ni se declara ausencia de vulnerabilidades. La revisión manual del proxy Loyalty confirma autenticación del dispositivo, verificación de revocación y PIN server-side para política/canje; esa inspección puntual no cubre todo el producto.

Las pruebas POS existentes incluyen cancelación de venta sin enviar, cancelación durante envío, reintentos ante 5xx, bloqueo de dispositivo revocado, cobro offline y PIN de canje. Son evidencia automatizada del servicio, no una prueba física de dos terminales ni de impresoras.

## Actualización de dictamen tras revisión de seguridad
NO APROBAR PRODUCCIÓN: ver SEGURIDAD_2026-10-28.md. Se confirmó escalamiento de permisos mediante sincronización de personal POS y se detectaron avisos de dependencias pendientes de remediar. Las pruebas funcionales siguen aprobadas; no neutralizan estos hallazgos. Guía de release: PASE_A_PRODUCCION.md.

Seguimiento: consultar REMEDIACION_2026-10-29.md; las dependencias se actualizaron y se verificó el arreglo POS en PR #50. La aceptación operativa y auditoría exhaustiva siguen siendo pendientes distintos.
