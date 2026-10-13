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
| AUD-012 | P1 | 🟡 Herramientas listas; **falta configurar el destino externo** | `deploy/backup.sh` + `restore-test.sh`; definir `BACKUP_REMOTE` y probar una restauración |
| AUD-021 | P1 | ✅ Corregido (#98) | reactivar cita repite el control de solapamiento |
| AUD-013 | P2 | ✅ Corregido | admisión atómica (`pg_advisory_xact_lock`) + barrido global |
| AUD-014 | P2 | ✅ Corregido (leads y usuarios) | `withPlanCapacity`; la instalación de plantillas conserva comprobación simple (abre sus propias transacciones) |
| AUD-015 | P2 | 🟠 **Requiere decisión** | el día de negocio de Food usa la zona del servidor (UTC en contenedores). Corregirlo cambia la clave de `DishSale`/`ModifierSale` de datos existentes: necesita migración de datos y definir si la zona es por organización (`Organization.timezone`). No se cambió `TZ` a ciegas |
| AUD-016 | P2 | 🟡 Parcial | idioma/tema ahora vienen de la base (sin volver a iniciar sesión); `formatDate*` aceptan idioma y las pantallas nuevas lo usan. Falta migrar el resto de llamadas |
| AUD-017 | P2 | 🟡 Parcial | grupos de botones de módulos con `radiogroup`/`aria-labelledby`. Falta una pasada WCAG completa en navegador |
| AUD-018 | P2 | ✅ Corregido | tope por etapa en pipeline, ventana en agenda, tope en KB y exportación por lotes (50 000 filas) |
| AUD-019 | P2 | ✅ Corregido | fallos de auditoría dejan señal en logs (sin metadata) |
| AUD-020 | P2 | 🟡 Documentado | `docs/DEPLOY.md` con la topología y el checklist de reconstrucción; guarda una copia del compose `preview` fuera del servidor |
