-- Workshop Manager: functions and triggers.
--
-- All functions run as the caller (security invoker), so RLS still applies, and
-- pin search_path = '' with fully qualified names.

-- ---------------------------------------------------------------------------
-- Short IDs
-- ---------------------------------------------------------------------------

-- Picks a random unused code for the owner: 2 characters from an alphabet without
-- 0/O and 1/I (32 symbols, 1,024 codes), growing to 3 (32,768) once 2 are used up.
create function public.next_short_id(p_owner uuid)
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  len integer := 2;
  candidate text;
begin
  -- Serialise ID assignment per owner so two inserts cannot pick the same code.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('short_id:' || p_owner::text));

  loop
    with recursive codes (code) as (
      select pg_catalog.substr(alphabet, i, 1)
      from pg_catalog.generate_series(1, 32) as i
      union all
      select codes.code || pg_catalog.substr(alphabet, i, 1)
      from codes, pg_catalog.generate_series(1, 32) as i
      where pg_catalog.length(codes.code) < len
    )
    select codes.code into candidate
    from codes
    where pg_catalog.length(codes.code) = len
      and not exists (
        select 1 from public.items it
        where it.owner_id = p_owner and it.short_id = codes.code
      )
    order by pg_catalog.random()
    limit 1;

    if candidate is not null then
      return candidate;
    end if;
    len := len + 1;
  end loop;
end;
$$;

create function public.items_set_short_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.short_id is null or pg_catalog.btrim(new.short_id) = '' then
    new.short_id := public.next_short_id(new.owner_id);
  else
    new.short_id := pg_catalog.upper(pg_catalog.btrim(new.short_id));
  end if;
  return new;
end;
$$;

create trigger items_set_short_id
  before insert or update of short_id on public.items
  for each row execute function public.items_set_short_id();

-- ---------------------------------------------------------------------------
-- Work lines: time and price default from the service
-- ---------------------------------------------------------------------------

create function public.work_lines_fill_defaults()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  svc record;
begin
  if new.minutes_each is null or new.price_each is null then
    select s.default_minutes, s.price into svc
    from public.services s
    where s.id = new.service_id;

    new.minutes_each := coalesce(new.minutes_each, svc.default_minutes, 0);
    new.price_each := coalesce(new.price_each, svc.price, 0);
  end if;
  return new;
end;
$$;

create trigger work_lines_fill_defaults
  before insert on public.work_lines
  for each row execute function public.work_lines_fill_defaults();

-- ---------------------------------------------------------------------------
-- Work line parts: snapshot the unit cost, move stock
-- ---------------------------------------------------------------------------

create function public.work_line_parts_snapshot_cost()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.customer_supplied then
    new.unit_cost := 0;
  elsif new.part_id is not null and (
    (tg_op = 'INSERT' and new.unit_cost is null)
    -- Part swapped without a new cost given: take the new part's cost.
    or (tg_op = 'UPDATE' and new.part_id is distinct from old.part_id
        and new.unit_cost is not distinct from old.unit_cost)
  ) then
    select p.unit_cost into new.unit_cost from public.parts p where p.id = new.part_id;
  end if;

  new.unit_cost := coalesce(new.unit_cost, 0);
  return new;
end;
$$;

create trigger work_line_parts_snapshot_cost
  before insert or update on public.work_line_parts
  for each row execute function public.work_line_parts_snapshot_cost();

-- Undo the old row's stock effect, apply the new row's. Customer-supplied parts
-- never touch stock. Deleting a work line (or its item) returns the parts.
create function public.work_line_parts_move_stock()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.part_id is not null and not old.customer_supplied then
    update public.parts set qty_on_hand = qty_on_hand + old.qty where id = old.part_id;
  end if;

  if tg_op in ('INSERT', 'UPDATE') and new.part_id is not null and not new.customer_supplied then
    update public.parts set qty_on_hand = qty_on_hand - new.qty where id = new.part_id;
  end if;

  return null;
end;
$$;

create trigger work_line_parts_move_stock
  after insert or update or delete on public.work_line_parts
  for each row execute function public.work_line_parts_move_stock();

-- ---------------------------------------------------------------------------
-- Part restocks: add qty, move unit cost to the weighted average
-- ---------------------------------------------------------------------------

create function public.part_restocks_apply()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Restocks cannot be edited. Delete the restock and enter it again.'
      using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    update public.parts p
    set unit_cost = case
          when p.qty_on_hand <= 0 then new.unit_cost
          else pg_catalog.round(
            (p.qty_on_hand * p.unit_cost + new.qty * new.unit_cost) / (p.qty_on_hand + new.qty), 4)
        end,
        qty_on_hand = p.qty_on_hand + new.qty
    where p.id = new.part_id;
    return new;
  end if;

  -- DELETE: take the qty back off. The average cost is left as it is.
  update public.parts set qty_on_hand = qty_on_hand - old.qty where id = old.part_id;
  return old;
end;
$$;

create trigger part_restocks_block_update
  before update on public.part_restocks
  for each row execute function public.part_restocks_apply();

create trigger part_restocks_apply
  after insert or delete on public.part_restocks
  for each row execute function public.part_restocks_apply();

-- ---------------------------------------------------------------------------
-- Settings: keep updated_at current
-- ---------------------------------------------------------------------------

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create trigger settings_touch_updated_at
  before update on public.settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Function privileges
-- ---------------------------------------------------------------------------

-- Postgres grants EXECUTE to PUBLIC by default. Only signed-in users need these;
-- next_short_id is called from the items trigger as the caller.
revoke execute on function
  public.next_short_id(uuid),
  public.items_set_short_id(),
  public.work_lines_fill_defaults(),
  public.work_line_parts_snapshot_cost(),
  public.work_line_parts_move_stock(),
  public.part_restocks_apply(),
  public.touch_updated_at()
from public, anon;

grant execute on function public.next_short_id(uuid) to authenticated;
