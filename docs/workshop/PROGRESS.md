# Estado de implementación

Estado: **módulo parcial en PR borrador; no activar para clientes ni desplegar como MVP**.

Implementado en la rama: especificación y auditoría, modelos y tres migraciones aditivas, registro de `WORKSHOP`, navegación bilingüe, portal protegido, vehículos del CRM, cotizaciones con cálculo neto/IVA y folio transaccional, PDF de cotización sin costos, aprobación y conversión única a orden, recepción y fotos privadas, estados básicos de la orden, inventario derivado de movimientos, compras, caja, pagos, crédito explícito, entrega y panel con cifras de la base. También hay historial paginado por vehículo, PDF de orden sin costos, registro de solicitud de factura y edición de vigencia, garantía y próximo servicio. La landing bilingüe de Taller Wolf y su formulario de Lead están implementados con publicación bloqueada por configuración y logotipo. El segundo incremento está publicado en el PR; el tercero se verifica localmente.

Verificación: la CI del segundo incremento pasó con sus suites E2E. Para el tercero pasaron 22 pruebas focalizadas con PostgreSQL desechable, incluidas PDF de orden, solicitud de factura, cobro de crédito tras entrega, solicitud pública idempotente, conversión a cliente/vehículo y organización cruzada; typecheck, lint de los archivos editados y compilación de producción también pasaron. La tercera migración coincide con el esquema de la base desechable. Falta volver a ejecutar la CI del tercer incremento tras publicarlo. No se han aplicado migraciones a una base real.

Pendiente para el MVP: pruebas negativas amplias de roles y organizaciones en órdenes/compras/caja; autorización de líneas adicionales; catálogo editable de servicios provisionales; archivo verificable del logotipo limpio; validación de la landing en navegador, aceptación de extremo a extremo y revisión final de seguridad. Los datos de próximo servicio ya se capturan; los recordatorios automáticos por WhatsApp pertenecen a la fase siguiente según la especificación. No hay cobro de Taller Wolf configurado.

El listado de criterios está en [TASKS.md](./TASKS.md). No se declara el MVP aprobado mientras haya pendientes de ese listado.
