# Estado de implementación

Estado: **base parcial en desarrollo; no activar para clientes ni desplegar como MVP**.

Completado: especificación adjunta, auditoría previa, modelos y migración aditiva, registro de módulo y navegación bilingüe, portal protegido con conteos reales, formulario de vehículo vinculado al CRM, borrador de cotización con cálculos server-side. La prueba de dinero verifica el caso de $4,400 y ajusta el centavo sobre la última línea con importe positivo. La migración se aplicó solo a PostgreSQL desechable; 22 pruebas focalizadas pasaron, incluidas organización cruzada y autorización. La compilación de producción de Next.js también pasó.

No completado: PDF, fotos, flujo de estados, orden, inventario, compras, caja, landing y permisos operativos del mecánico. El panel aún no calcula balance ni ingresos de hoy. La migración no se ha aplicado a producción. No hay cobro de Taller Wolf configurado.

El listado de criterios está en [TASKS.md](./TASKS.md). No se declara el MVP aprobado mientras haya pendientes de ese listado.
