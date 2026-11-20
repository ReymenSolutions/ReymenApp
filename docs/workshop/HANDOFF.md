# Continuación del trabajo

Leer primero [especificación](./reymen-talleres-spec.md), [auditoría](./FASE0_AUDITORIA.md), [progreso](./PROGRESS.md) y [tareas](./TASKS.md). El código en esta rama es una base parcial, no un MVP. No activar el módulo en la cuenta de Taller Wolf todavía.

La migración se generó como diff entre el esquema base del commit y el esquema editado; no se ejecutó sobre ninguna base real. Para desarrollar: instalar dependencias, generar Prisma, validar esquema, correr tests y usar PostgreSQL desechable para integración. Antes de añadir una acción, comprobar entitlement, rol y tenant en el servidor. Toda operación que afecte dinero, stock o estado debe ser atómica y tener pruebas de concurrencia e idempotencia.

Próximo corte recomendado: completar recepción + PDF con folios y luego conversión a orden. Después inventario/caja, y al final la landing. Conservar el ejemplo Audi solo como caso de prueba; no sembrarlo en la base.
