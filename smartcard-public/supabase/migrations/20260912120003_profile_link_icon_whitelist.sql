-- ---------------------------------------------------------------------------
-- profile_links.icon (columna desde 20260905120006_profile_links.sql)
-- existía sin usarse -- nada la llenaba ni la leía. Pedido del usuario:
-- poder elegir un ícono (Instagram, reseñas con estrella, etc.) para cada
-- link del perfil público.
--
-- Mismo criterio que ya rige theme_config (sección 13/70): whitelist fija
-- en el backend, no un valor libre que el cliente pueda mandar como quiera
-- -- la lista vive en packages/lib/src/link-icons.ts (LINK_ICON_OPTIONS),
-- este constraint es su espejo en la base de datos. Nulo sigue significando
-- "sin ícono elegido" -- ProfileView.tsx cae al ícono genérico en ese caso.
-- ---------------------------------------------------------------------------

alter table profile_links add constraint profile_links_icon_check check (
  icon is null or icon in (
    'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'whatsapp',
    'reviews', 'phone', 'email', 'maps'
  )
);
