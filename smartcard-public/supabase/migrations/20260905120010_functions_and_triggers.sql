-- ---------------------------------------------------------------------------
-- updated_at genérico
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_clients_updated_at before update on clients for each row execute function set_updated_at();
create trigger trg_profiles_updated_at before update on profiles for each row execute function set_updated_at();
create trigger trg_profile_links_updated_at before update on profile_links for each row execute function set_updated_at();
create trigger trg_cards_updated_at before update on cards for each row execute function set_updated_at();
create trigger trg_themes_updated_at before update on themes for each row execute function set_updated_at();
create trigger trg_admin_profiles_updated_at before update on admin_profiles for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Generación de card_code (sección 8): REY-000001, REY-000002, ...
-- Secuencia + función, no un INTEGER secuencial expuesto directamente como
-- identificador de base de datos (ese sigue siendo el UUID `id`).
-- ---------------------------------------------------------------------------
create sequence card_code_seq start 1;

create or replace function generate_card_code()
returns text language sql as $$
  select 'REY-' || lpad(nextval('card_code_seq')::text, 6, '0');
$$;

create or replace function set_card_code()
returns trigger language plpgsql as $$
begin
  if new.card_code is null then
    new.card_code := generate_card_code();
  end if;
  return new;
end;
$$;

create trigger trg_cards_set_card_code
before insert on cards
for each row execute function set_card_code();

-- ---------------------------------------------------------------------------
-- Slugs reservados (sección 11)
-- ---------------------------------------------------------------------------
create or replace function prevent_reserved_slug()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from reserved_slugs where slug = new.slug) then
    raise exception 'El slug "%" está reservado y no puede usarse.', new.slug;
  end if;
  return new;
end;
$$;

create trigger trg_profiles_reserved_slug
before insert or update of slug on profiles
for each row execute function prevent_reserved_slug();

-- ---------------------------------------------------------------------------
-- Validación de destino de tarjeta (sección 24).
-- Se apoya en destination_types en vez de hardcodear "= 'PROFILE'" para que
-- agregar un tipo nuevo (INSERT en destination_types) baste sin tocar este
-- trigger, salvo que el tipo nuevo tenga reglas realmente distintas.
-- ---------------------------------------------------------------------------
create or replace function validate_card_destination()
returns trigger language plpgsql as $$
declare
  v_requires_profile boolean;
  v_requires_url boolean;
begin
  select requires_profile, requires_url into v_requires_profile, v_requires_url
  from destination_types where code = new.destination_type;

  if v_requires_profile and new.profile_id is null then
    raise exception 'destination_type % requiere profile_id', new.destination_type;
  elsif not v_requires_profile and new.profile_id is not null then
    raise exception 'destination_type % no debe tener profile_id', new.destination_type;
  end if;

  if v_requires_url and coalesce(new.destination_url, '') = '' then
    raise exception 'destination_type % requiere destination_url', new.destination_type;
  elsif not v_requires_url and new.destination_url is not null then
    raise exception 'destination_type % no debe tener destination_url', new.destination_type;
  end if;

  return new;
end;
$$;

create trigger trg_cards_validate_destination
before insert or update on cards
for each row execute function validate_card_destination();
