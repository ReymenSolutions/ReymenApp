-- ---------------------------------------------------------------------------
-- audit_logs (sección 48): solo cambios administrativos relevantes, no cada
-- clic del panel. Inmutable por diseño: no se define ninguna policy de
-- UPDATE/DELETE en 000012, así que ninguna sesión de aplicación puede
-- modificarla ni borrarla.
-- ---------------------------------------------------------------------------
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references admin_profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  occurred_at timestamptz not null default now()
);

comment on table audit_logs is
  'Inmutable: sin policies de UPDATE/DELETE. admin_user_id se conserva como SET NULL si el usuario se elimina, para no perder el registro histórico.';
comment on column audit_logs.action is
  'Verbo.entidad en snake/dot case, ej. card.destination_changed, profile.updated, client.created.';
