-- ---------------------------------------------------------------------------
-- profile_links (sección 13): links dinámicos editables sin tocar código.
-- ---------------------------------------------------------------------------
create table profile_links (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  title text not null,
  url text not null check (url ~* '^https?://'),
  icon text,
  type text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
