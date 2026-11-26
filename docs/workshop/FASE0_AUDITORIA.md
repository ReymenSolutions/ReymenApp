# Auditoría previa — Reymen Talleres

Fuente principal: [reymen-talleres-spec.md](./reymen-talleres-spec.md), entregada el 20 de noviembre de 2026. Esta auditoría se hizo antes de modificar código del módulo.

## Arquitectura comprobada

- ReymenApp es una aplicación Next.js con App Router, Prisma y PostgreSQL. El repositorio actual usa **Next.js 16**, aunque el prompt menciona Next.js 15. Se siguen las convenciones y documentación de la versión instalada.
- `REALTY` figura en `PlatformModule`, `src/lib/modules.ts`, `OrganizationModule`, la barra lateral y `/portal/realty`. Sus datos específicos se guardan en modelos con `organizationId` y aprovechan el CRM.
- `CONTRACTORS` se menciona en la especificación como precedente, pero **no está implementado como valor de `PlatformModule` ni ruta del portal** en esta revisión. Talleres seguirá el precedente comprobable de Realty.
- Para páginas existe `requireModule(organizationId, module)` en `src/lib/modules.ts`, que redirige si falta el permiso comercial. Para acciones y API existe `assertModuleEnabled`, que rechaza la operación. Además hace falta validar el rol y el `organizationId` de cada registro. Una guarda de página por sí sola no protege una acción del servidor.
- El CRM ya tiene `Lead` y `Customer`. Los vehículos y trabajos deben referenciar esas personas sin duplicar sus datos. Se deben revisar las relaciones existentes y cómo se convierte un Lead en Customer antes de diseñar cada formulario.
- `Customer` exige teléfono y usa una llave de 10 dígitos por organización; `Lead` admite teléfono opcional y `metadata`. El formulario público deberá crear un Lead y su paso a Customer requerirá teléfono válido y control de duplicados.
- Hay alternancia español/inglés en el portal. La especificación está en español, pero el nuevo módulo tendrá etiquetas y mensajes en ambos idiomas.

## Decisiones y riesgos antes de implementar

- La tarifa de Taller Wolf es **tentativa** y la fecha de cobro está pendiente. No se crea una suscripción ni se asigna una tarifa automáticamente.
- El mecánico encargado aún no está confirmado: no se crea un usuario ficticio. Los permisos se diseñan con esa limitación en mente.
- La cotización Audi A1 y su folio sirven solo para validar formato y aritmética. No se importan como registros reales.
- Los servicios provisionales carecen de costo y precio; no se precargan montos imaginarios.
- La tabla de ejemplo tiene una discrepancia aritmética: sus ocho importes netos mostrados suman **$3,793.11**, mientras el subtotal declarado es **$3,793.10**. Además, la columna llamada «Precio neto» muestra el importe neto de la línea cuando la cantidad es 4 L o 3 piezas. La prueba de $4,400 debe partir de importes brutos de referencia y aplicar una regla explícita de reparto/redondeo, sin tratar la columna como precio unitario real.
- Falta el archivo limpio `taller-wolf-logo-limpio.png` como recurso local verificable. La imagen incluida en el mensaje no sustituye ese archivo para publicar la landing o PDFs.
- El alcance abarca inventario, caja, cotizaciones, PDF y landing pública. Cada flujo debe pasar sus criterios de aceptación antes de declararse terminado; una ruta vacía o un esquema sin flujo operativo no representa un MVP listo para producción.

## Orden de implementación

1. Esquema y migración aislada, sin ejecutar sobre bases reales.
2. Registro del módulo, autorización y navegación bilingüe.
3. Flujos de vehículo, cotización y orden con cálculos monetarios y PDF.
4. Inventario, compras, caja y panel derivados de transacciones reales.
5. Landing conectada al CRM y pruebas de aceptación de extremo a extremo.

El estado de avance y los pendientes se registrarán en `PROGRESS.md`.
