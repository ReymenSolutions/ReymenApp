# Continuación del trabajo

Leer primero [especificación](./reymen-talleres-spec.md), [auditoría](./FASE0_AUDITORIA.md), [progreso](./PROGRESS.md) y [tareas](./TASKS.md). El código en esta rama es una base parcial, no un MVP. No activar el módulo en la cuenta de Taller Wolf todavía.

La migración se generó como diff entre el esquema base del commit y el esquema editado; no se ejecutó sobre ninguna base real. Para desarrollar: instalar dependencias, generar Prisma, validar esquema, correr tests y usar PostgreSQL desechable para integración. Antes de añadir una acción, comprobar entitlement, rol y tenant en el servidor. Toda operación que afecte dinero, stock o estado debe ser atómica y tener pruebas de concurrencia e idempotencia.

El PR borrador ya incluye recepción, folios, PDFs, conversión, inventario, caja, líneas adicionales autorizadas, servicios editables y una landing desactivada. Los nueve servicios provisionales se crean sin costo ni precio al activar `WORKSHOP`; reactivar no sobrescribe ediciones. La solicitud pública crea un Lead sin enlazar clientes ni conversaciones por teléfono; al convertirla, el propietario debe confirmar que verificó la identidad. Próximo corte: validación del flujo completo en navegador, aceptación del taller y revisión independiente de seguridad. La herramienta de escaneo formal no estuvo disponible en este entorno.

Para abrir la landing se necesita el archivo verificado `public/taller-wolf-logo-limpio.png`, el ID real de la organización en `WORKSHOP_WOLF_ORG_ID`, activar `WORKSHOP` para ella y finalmente poner `WORKSHOP_WOLF_LANDING_ENABLED=true`; no activar con datos incompletos. Conservar el ejemplo Audi solo como caso de prueba; no sembrarlo en la base. No ejecutar migraciones ni activar Talleres para un cliente hasta completar la aceptación.

El PNG ya está en `public/`, generado como versión limpia de la imagen compartida en el chat. Falta aprobación visual de marca del cliente antes de considerar ese activo verificado. La bandera de publicación permanece apagada.
