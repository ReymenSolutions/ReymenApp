-- ---------------------------------------------------------------------------
-- Tarjetas por persona: cada tarjeta puede quedar asignada a un integrante
-- de la empresa (p. ej. cada asesor de una inmobiliaria con su propia
-- tarjeta). null = tarjeta de la empresa, sin dueño (recepción, mesa 1...).
--
-- Quién la ve y la edita lo decide la app (ReymenApp, con la llave de
-- servicio): dueño/administrador/gerente ven y asignan todas; un asesor o
-- personal solo ve y edita el perfil de la suya.
--
-- Se aplica en el SQL Editor de Supabase de SmartCard. Es idempotente.
-- ---------------------------------------------------------------------------

alter table cards
  add column if not exists assigned_user_id uuid references auth.users (id) on delete set null;

create index if not exists cards_assigned_user_id_idx on cards (assigned_user_id) where deleted_at is null;

comment on column cards.assigned_user_id is
  'Integrante (auth.users, el mismo de company_users.user_id) al que está asignada la tarjeta. null = tarjeta de la empresa.';

notify pgrst, 'reload schema';
