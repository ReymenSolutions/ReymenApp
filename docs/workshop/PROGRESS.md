# Estado de implementación

Estado: **módulo parcial en PR borrador; no activar para clientes ni desplegar como MVP**.

Implementado en la rama: especificación y auditoría, modelos y dos migraciones aditivas, registro de `WORKSHOP`, navegación bilingüe, portal protegido, vehículos del CRM, cotizaciones con cálculo neto/IVA y folio transaccional, PDF de cotización sin costos, aprobación y conversión única a orden, recepción y fotos privadas, estados básicos de la orden, inventario derivado de movimientos, compras, caja, pagos, crédito explícito, entrega y panel con cifras de la base. El segundo incremento sigue sin publicar en el PR.

Verificación local del segundo incremento: 26 pruebas focalizadas pasaron con PostgreSQL desechable, incluidas conversión concurrente, compra y pago idempotentes, stock, entrega y accesos negativos a PDF/fotos. Pasaron typecheck, lint de archivos cambiados y compilación de producción. La primera CI del PR falló por cinco mensajes de error sin traducción; se corrigieron localmente y falta volver a ejecutar la CI tras publicar. No se han aplicado migraciones a una base real.

Pendiente para el MVP: pruebas negativas amplias de roles y organizaciones en PDF/fotos/órdenes/compras/caja; autorización de líneas adicionales; PDF de orden; historial de vehículo; solicitud de factura y recordatorios; configuración de servicios; landing bilingüe conectada al CRM; archivo verificable del logotipo limpio; aceptación de extremo a extremo y revisión final de seguridad. También falta actualizar el resto de la documentación de los flujos nuevos. No hay cobro de Taller Wolf configurado.

El listado de criterios está en [TASKS.md](./TASKS.md). No se declara el MVP aprobado mientras haya pendientes de ese listado.
