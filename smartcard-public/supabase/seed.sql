-- ---------------------------------------------------------------------------
-- Datos de ejemplo para desarrollo local (supabase db reset / supabase start).
-- NO ejecutar contra producción. Usa UUIDs fijos para poder encadenar las
-- referencias sin depender de \gset ni de un runner interactivo.
--
-- Reproduce los tres casos de prueba que pide la sección 89/91 del prompt
-- original: REY-000001 como perfil digital, REY-000002 como Google Reviews
-- (con el flujo de "cambiar destino sin tocar la tarjeta" listo para
-- probarse a mano una vez exista la app).
-- ---------------------------------------------------------------------------

insert into clients (id, name, business_name, email, status) values
  ('11111111-1111-1111-1111-111111111111', 'María Mendoza', 'XYZ Inmobiliaria', 'maria@example.com', 'ACTIVE'),
  ('22222222-2222-2222-2222-222222222222', 'Cafetería ABC', 'Cafetería ABC', 'contacto@cafeteriaabc.com', 'ACTIVE');

insert into profiles (id, client_id, slug, first_name, last_name, display_name, job_title, company, theme_id)
select
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  '11111111-1111-1111-1111-111111111111',
  'maria-mendoza', 'María', 'Mendoza', 'María Mendoza', 'Asesora Inmobiliaria', 'XYZ Inmobiliaria',
  id
from themes where slug = 'real_estate';

insert into profile_links (profile_id, title, url, icon, type, sort_order) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Ver propiedades', 'https://xyzinmobiliaria.mx/propiedades', 'home', 'website', 1),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Agenda una cita', 'https://cal.com/maria-mendoza', 'calendar', 'custom', 2);

-- REY-000001: destino PROFILE -> ejercita el join cards -> profiles.
insert into cards (card_code, client_id, profile_id, destination_type) values
  ('REY-000001', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'PROFILE');

-- REY-000002: destino GOOGLE_REVIEWS -> ejercita la rama sin perfil, con URL.
insert into cards (card_code, client_id, destination_type, destination_url) values
  ('REY-000002', '22222222-2222-2222-2222-222222222222', 'GOOGLE_REVIEWS', 'https://g.page/r/example/review');

-- Smoke tests sugeridos después de aplicar (vía SQL editor o `supabase db execute`):
--   select get_public_profile('maria-mendoza');
--   select get_card_for_redirect('REY-000001');
--   select get_card_for_redirect('REY-000002');
--   select log_event('nfc_scan', 'NFC', p_card_code := 'REY-000001');
--   select count(*) from events;  -- debe ser 1 tras la línea anterior
