-- ---------------------------------------------------------------------------
-- Fase 17: agrega 'client_error' al catálogo cerrado de event_type de
-- `events` (20260905120008_events.sql) -- en vez de montar una tabla o
-- plataforma de analítica técnica aparte, se reusa la infraestructura de
-- negocio que ya existe (log_event(), la policy events_select ya abierta a
-- SUPERADMIN/ADMIN/VIEWER, /analytics como referencia de cómo consultarla).
--
-- Lo escribe apps/public/app/api/client-error/route.ts, que recibe el aviso
-- del error boundary del lado del cliente (apps/public/app/error.tsx) -- ver
-- FASE17.md sección 2. is_bot se sigue calculando igual (Fase 2) aunque no
-- tenga mucho sentido para este tipo de evento en particular; no vale la
-- pena una excepción solo para esto.
--
-- No se puede usar `alter table ... add constraint` sin quitar antes la
-- vieja: un check constraint no admite agregar un valor suelto, hay que
-- reemplazar la condición completa. El nombre por default de Postgres para
-- un check inline sin nombre explícito es <tabla>_<columna>_check.
-- ---------------------------------------------------------------------------

alter table events drop constraint events_event_type_check;

alter table events add constraint events_event_type_check check (event_type in (
  'profile_view', 'nfc_scan', 'qr_scan', 'whatsapp_click', 'call_click',
  'email_click', 'instagram_click', 'facebook_click', 'linkedin_click',
  'maps_click', 'website_click', 'save_contact', 'custom_link_click',
  'google_reviews_redirect', 'external_redirect',
  'client_error'
));
