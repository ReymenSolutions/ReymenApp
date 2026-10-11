# CRM de Reymen — plan de mejoras (en curso)

Decidido por el usuario: estas 9 mejoras se trabajan **primero**. Las opciones
de CRM a medida y de diseño por cliente quedan para investigar después
(ver `docs/futuro/CRM-A-MEDIDA-Y-TEMAS.md`).

Contexto de cómo está construido hoy: `Lead` (contacto) → `Opportunity`
(venta en un `PipelineStage` configurable), `Note`, `Appointment`,
`FollowUpRule/Log`. `Conversation` (WhatsApp) **no** tiene enlace al lead: se
une por `contactPhone`. Entradas: portal, CSV, webhooks n8n firmados.

Estado: [ ] pendiente · [~] en curso · [x] hecho

| # | Mejora | Estado |
|---|---|---|
| 1 | Unir conversaciones con contactos por un enlace real: `Conversation.leadId` + llave de teléfono (últimos 10 dígitos, `src/lib/phone.ts`); migración con relleno de datos existentes | [x] |
| 2 | Crear el lead automáticamente cuando escribe alguien nuevo por WhatsApp (respetando el límite del plan y `doNotContact`) | [x] |
| 3 | Vista "qué hago hoy": leads sin respuesta, seguimientos vencidos, citas de hoy, oportunidades sin actividad | [ ] |
| 4 | Campos y etiquetas propios por cliente (ej. "tratamiento de interés", "aseguradora") | [ ] |
| 5 | Línea de tiempo única en la ficha del contacto: mensajes, citas, notas, cambios de estado | [ ] |
| 6 | Un estado en vez de dos: la etapa del pipeline es la fuente y `Lead.status` se deriva (compatibilidad con reportes/webhooks) | [ ] |
| 7 | Fusionar duplicados y evitar crearlos al importar o recibir webhooks | [ ] |
| 8 | Reportes que respondan una pregunta: origen de los que compran, tiempo a cerrar, dónde se caen | [ ] |
| 9 | Conectar con Foods/POS mediante el modelo `Customer` (ver `docs/automations/ARQUITECTURA.md` §K) | [ ] |

## Orden sugerido y dependencias

1 y 2 van juntas (el enlace real es lo que permite crear y vincular el lead).
Después 5 (usa el enlace), 3, 7, 4, 6, 8 y 9. La 6 toca reportes y webhooks:
hacerla con compatibilidad hacia atrás y migración de datos.

## Reglas para trabajar esto

- Datos siempre filtrados por `organizationId`; sin migraciones destructivas.
- Todo texto nuevo en ES y EN (`i18n.ts`); errores con `UserError` + traducción
  en `server-messages.ts`.
- Cada mejora en su propio PR, con pruebas; migración con valores por defecto
  seguros y backfill para datos existentes (p. ej. enlazar conversaciones
  antiguas por teléfono normalizado).
