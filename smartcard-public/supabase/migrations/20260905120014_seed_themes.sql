-- ---------------------------------------------------------------------------
-- Themes base (sección 53). Cuatro presets iniciales, todos con la misma
-- forma de config (tokens seguros, nunca CSS libre).
-- ---------------------------------------------------------------------------
insert into themes (slug, name, config) values
  ('minimal', 'Minimal',
    '{"layout":"minimal","primary_color":"#111111","accent_color":"#4F46E5","font":"inter","border_radius":"md"}'::jsonb),
  ('dark', 'Dark',
    '{"layout":"minimal","background":"dark","primary_color":"#FFFFFF","accent_color":"#22D3EE","font":"inter","border_radius":"md"}'::jsonb),
  ('corporate', 'Corporate',
    '{"layout":"corporate","primary_color":"#0F172A","accent_color":"#2563EB","font":"inter","border_radius":"sm"}'::jsonb),
  ('real_estate', 'Real Estate',
    '{"layout":"real_estate","primary_color":"#1B4332","accent_color":"#D4A373","font":"inter","border_radius":"lg"}'::jsonb);
