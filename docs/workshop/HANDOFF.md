# Continuación del trabajo

Leer primero [especificación](./reymen-talleres-spec.md), [auditoría](./FASE0_AUDITORIA.md), [progreso](./PROGRESS.md) y [tareas](./TASKS.md). El código en esta rama es una base parcial, no un MVP. No activar el módulo en la cuenta de Taller Wolf todavía.

La migración se generó como diff entre el esquema base del commit y el esquema editado; no se ejecutó sobre ninguna base real. Para desarrollar: instalar dependencias, generar Prisma, validar esquema, correr tests y usar PostgreSQL desechable para integración. Antes de añadir una acción, comprobar entitlement, rol y tenant en el servidor. Toda operación que afecte dinero, stock o estado debe ser atómica y tener pruebas de concurrencia e idempotencia.

El PR borrador ya incluye recepción, folios, PDFs, conversión, inventario, caja y una landing desactivada. Próximo corte recomendado: autorización de líneas nuevas en orden, configuración de servicios y próximo servicio, ampliar pruebas negativas y validar en navegador. Para abrir la landing se necesita el archivo verificado `public/taller-wolf-logo-limpio.png`, el ID real de la organización en `WORKSHOP_WOLF_ORG_ID`, activar `WORKSHOP` para ella y finalmente poner `WORKSHOP_WOLF_LANDING_ENABLED=true`; no activar con datos incompletos. Conservar el ejemplo Audi solo como caso de prueba; no sembrarlo en la base.
