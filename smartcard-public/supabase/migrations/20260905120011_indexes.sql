-- ---------------------------------------------------------------------------
-- Índices (sección 56). Solo los que de verdad se usan en las rutas
-- calientes (/n/, /q/, /[slug]) y en los filtros de analytics del panel.
-- ---------------------------------------------------------------------------

-- slug único solo entre perfiles activos: permite reutilizar un slug si el
-- perfil original se da de baja (soft delete). card_code, en cambio, es
-- único siempre (ver 000007): un código impreso en una tarjeta física nunca
-- debe reasignarse, aunque la tarjeta original se dé de baja.
create unique index idx_profiles_slug_active on profiles (slug) where deleted_at is null;
create index idx_profiles_client_id on profiles (client_id);

create index idx_cards_client_id on cards (client_id);
create index idx_cards_profile_id on cards (profile_id);

create index idx_profile_links_profile_id on profile_links (profile_id);

create index idx_events_card_id on events (card_id);
create index idx_events_profile_id on events (profile_id);
create index idx_events_occurred_at on events (occurred_at desc);
create index idx_events_profile_occurred on events (profile_id, occurred_at desc);
create index idx_events_event_type on events (event_type);

create index idx_audit_logs_entity on audit_logs (entity_type, entity_id);
create index idx_audit_logs_occurred_at on audit_logs (occurred_at desc);

-- card_code ya queda indexado por el UNIQUE de la columna (000007); no se
-- duplica aquí.
