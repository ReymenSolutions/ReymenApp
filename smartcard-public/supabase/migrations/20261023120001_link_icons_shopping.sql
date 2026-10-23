-- ---------------------------------------------------------------------------
-- Íconos nuevos para links públicos: Mercado Libre y compras/ventas (carrito).
-- Mismo constraint que 20260912120003_profile_link_icon_whitelist.sql, con las
-- dos claves nuevas (espejo de packages/lib/src/link-icons.ts).
-- ---------------------------------------------------------------------------

alter table profile_links drop constraint if exists profile_links_icon_check;
alter table profile_links add constraint profile_links_icon_check check (
  icon is null or icon in (
    'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin', 'whatsapp',
    'reviews', 'phone', 'email', 'maps', 'mercadolibre', 'shopping'
  )
);
