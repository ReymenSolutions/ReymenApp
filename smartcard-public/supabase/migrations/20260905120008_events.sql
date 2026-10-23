-- ---------------------------------------------------------------------------
-- events (sección 15): analítica propia.
--
-- Decisión de privacidad deliberada: esta tabla NO tiene columna de IP.
-- La sección 15 pide "cuidado con privacidad" y "evitar guardar IP completa
-- si no es necesaria". Para lo que este producto necesita (contar
-- escaneos/clics, no perseguir usuarios individuales) la IP no aporta nada
-- que occurred_at + user_agent + card_id no den ya. Si en el futuro se
-- necesita IP para investigar abuso puntual, la fuente correcta son los
-- logs de Nginx (rotados, fuera de esta base de datos de producto), no una
-- columna aquí. Ver DATABASE.md.
-- ---------------------------------------------------------------------------
create table events (
  id uuid primary key default gen_random_uuid(),
  card_id uuid references cards (id) on delete set null,
  profile_id uuid references profiles (id) on delete set null,
  link_id uuid references profile_links (id) on delete set null,
  event_type text not null check (event_type in (
    'profile_view', 'nfc_scan', 'qr_scan', 'whatsapp_click', 'call_click',
    'email_click', 'instagram_click', 'facebook_click', 'linkedin_click',
    'maps_click', 'website_click', 'save_contact', 'custom_link_click',
    'google_reviews_redirect', 'external_redirect'
  )),
  source text not null check (source in ('NFC', 'QR', 'DIRECT')),
  occurred_at timestamptz not null default now(),
  user_agent text,
  referrer text,
  device_type text check (device_type in ('mobile', 'tablet', 'desktop', 'unknown')),
  is_bot boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table events is
  'Analítica propia. Sin columna de IP (ver comentario arriba). occurred_at siempre en UTC (sección 86); el panel convierte a la zona horaria de operación.';
comment on column events.is_bot is
  'true cuando el user_agent coincide con un bot/crawler/preview conocido. Se guarda igual (útil para debug) pero se excluye de las métricas que ve el cliente.';
