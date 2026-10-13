# Seguimiento de la auditoría maestra (2026-10-13)

Estado de los 21 hallazgos de `ReymenApp_Auditoria_Maestra.md` (revisión `00e2dce`), verificados uno por uno contra el código antes de corregir.

| ID | Prioridad | Estado | Dónde / cómo |
|---|---|---|---|
| AUD-001 | P0 | ✅ Corregido (#98) | `assertOrgUser` en crear/editar oportunidad |
| AUD-002 | P0 | ✅ Corregido (#98) | `assertOrgLead` en citas; recordatorios nunca exponen contactos ajenos |
| AUD-003 | P0 | ✅ Corregido (#98) | permisos `leads:*` en crear/eliminar/fusionar/estado |
| AUD-004 | P1 | ✅ Corregido (#99) | `session-guard`: usuario/org activos, rol vigente, `sessionVersion` |
| AUD-005 | P1 | ✅ Corregido (#99) | secreto MFA pendiente + contraseña para reemplazar |
| AUD-006 | P1 | ✅ Corregido (#99) | suspensión cierra API keys y webhooks firmados |
| AUD-007 | P1 | ✅ Corregido (#100) | el reintento reconoce `order.completed` y `delivery.order` |
| AUD-008 | P1 | ✅ Corregido (#100) | reclamo atómico + recuperación de PROCESSING abandonados |
| AUD-009 | P1 | ✅ Corregido (#100) | event-id obligatorio en ventas POS + deduplicación por firma |
| AUD-010 | P1 | ✅ Corregido (#100) | `stripeEventAt`: solo eventos más nuevos |
| AUD-011 | P1 | ✅ Corregido (#100) | sin Resend no se registran enlaces en producción |
| AUD-012 | P1 | 🟡 Herramientas y guía listas; **falta tu paso**: crear el bucket y `BACKUP_REMOTE` (guía en `docs/DEPLOY.md`) | `deploy/backup.sh` (base + configuración cifrada), `restore-test.sh` |
| AUD-021 | P1 | ✅ Corregido (#98) | reactivar cita repite el control de solapamiento |
| AUD-013 | P2 | ✅ Corregido | admisión atómica (`pg_advisory_xact_lock`) + barrido global |
| AUD-014 | P2 | ✅ Corregido (leads y usuarios) | `withPlanCapacity`; la instalación de plantillas conserva comprobación simple (abre sus propias transacciones) |
| AUD-015 | P2 | ✅ Corregido | día de negocio por zona de cada organización (`business-day.ts`): ventas de hoy, gráfica por hora y diaria, conteos por platillo, captura manual, purga de ventas de prueba y pantallas de Food/Inicio/Panel. Los conteos existentes (guardados en UTC) siguen siendo válidos; el histórico no se reasigna |
| AUD-016 | P2 | ✅ Corregido (portal) | idioma/tema desde la base; `formatDate*` aceptan idioma y todo el portal los usa. El Admin interno conserva fechas en español |
| AUD-017 | P2 | 🟡 Mejorado | 85 etiquetas de formularios ahora asociadas a su control (`htmlFor`/`id`) y grupos de botones etiquetados. Falta una auditoría WCAG completa con lector de pantalla y los selectores de Radix |
| AUD-018 | P2 | ✅ Corregido | tope por etapa en pipeline, ventana en agenda, tope en KB y exportación por lotes (50 000 filas) |
| AUD-019 | P2 | ✅ Corregido | fallos de auditoría dejan señal en logs (sin metadata) |
| AUD-020 | P2 | 🟡 Cubierto operativamente | `backup.sh` respalda cifrada la configuración local (compose/.env/nginx); `docs/DEPLOY.md` tiene el checklist de reconstrucción |
