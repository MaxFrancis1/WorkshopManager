-- Workshop Manager: item value (expected sale) and configured purchase sources.
--
-- 1. sources: where you buy from (Facebook, car boot, Present…), set up in Settings.
--    purchases.source_id replaces the free-text purchases.source, which is backfilled
--    and kept in step by a trigger until the app no longer uses it (a later migration
--    drops the column and the trigger).
-- 2. items.expected_price: what you are trying to sell the item for. With the asking
--    price of a live single-item listing, it gives the item a sale value, so stock can
--    be shown both as invested (cost) and at sale value. Profit stays sale − cost.

-- ---------------------------------------------------------------------------
-- Sources
-- ---------------------------------------------------------------------------

create table public.sources (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

create unique index sources_owner_name_key on public.sources (owner_id, lower(name));

alter table public.sources enable row level security;
create policy owner_all on public.sources for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
revoke all on public.sources from anon;
grant select, insert, update, delete on public.sources to authenticated;

alter table public.purchases
  add column source_id uuid references public.sources (id) on delete restrict;

create index purchases_source_id_idx on public.purchases (source_id);

-- Backfill: one source per distinct name per owner (trimmed, case-insensitive,
-- first spelling used wins), then link every purchase to it.
insert into public.sources (owner_id, name)
select distinct on (p.owner_id, lower(btrim(p.source))) p.owner_id, btrim(p.source)
from public.purchases p
where p.source is not null and btrim(p.source) <> ''
order by p.owner_id, lower(btrim(p.source)), p.created_at;

update public.purchases p
set source_id = s.id
from public.sources s
where p.source_id is null
  and s.owner_id = p.owner_id
  and lower(s.name) = lower(btrim(p.source));

-- Transitional: keep purchases.source (text) and source_id in step, so screens that
-- still write the text keep working. Text without a matching source creates one.
create function public.purchases_sync_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_name text;
begin
  if tg_op = 'UPDATE' and new.source_id is distinct from old.source_id then
    select s.name into new.source from public.sources s where s.id = new.source_id;
    return new;
  end if;

  if tg_op = 'INSERT' and new.source_id is not null then
    select s.name into new.source from public.sources s where s.id = new.source_id;
    return new;
  end if;

  if tg_op = 'INSERT' or new.source is distinct from old.source then
    v_name := nullif(pg_catalog.btrim(new.source), '');
    if v_name is null then
      new.source := null;
      new.source_id := null;
    else
      insert into public.sources (owner_id, name)
      values (new.owner_id, v_name)
      on conflict (owner_id, lower(name)) do nothing;
      select s.id, s.name into new.source_id, new.source
      from public.sources s
      where s.owner_id = new.owner_id and lower(s.name) = lower(v_name);
    end if;
  end if;
  return new;
end;
$$;

create trigger purchases_sync_source
  before insert or update of source, source_id on public.purchases
  for each row execute function public.purchases_sync_source();

revoke execute on function public.purchases_sync_source() from public, anon;

-- purchase_allocations: source now comes from the sources table; source_id added.
create or replace view public.purchase_allocations
with (security_invoker = true)
as
select
  p.id                                                     as purchase_id,
  p.owner_id,
  p.purchased_on,
  coalesce((select s.name from public.sources s where s.id = p.source_id), p.source) as source,
  p.price + p.postage_in                                   as total_cost,
  count(i.id)                                              as item_count,
  count(i.id) filter (where i.allocated_cost is not null)  as allocated_item_count,
  coalesce(sum(i.allocated_cost), 0)                       as allocated_cost,
  p.price + p.postage_in - coalesce(sum(i.allocated_cost), 0) as unallocated_cost,
  coalesce(sum(i.allocated_cost), 0) > p.price + p.postage_in  as over_allocated,
  p.source_id
from public.purchases p
left join public.items i on i.purchase_id = p.id
group by p.id;

-- ---------------------------------------------------------------------------
-- Item value
-- ---------------------------------------------------------------------------

alter table public.items
  add column expected_price numeric(10,2) check (expected_price is null or expected_price >= 0);

-- item_costs gains the item's value. Existing columns are unchanged; new ones are
-- appended (create or replace view only allows adding at the end).
--   listed_price:     lowest asking price of a live listing of this item on its own
--                     (a lot's price covers several items, so it is not used)
--   sale_value:       listed_price, else expected_price
--   potential_profit: sale_value − total_cost, before fees and postage
create or replace view public.item_costs
with (security_invoker = true)
as
select
  i.id          as item_id,
  i.owner_id,
  i.short_id,
  i.name,
  i.status,
  i.category_id,
  i.purchase_id,
  i.customer_id,
  pu.purchased_on,
  coalesce(
    i.allocated_cost,
    round(pa.unallocated_cost / nullif(pa.item_count - pa.allocated_item_count, 0), 2),
    0
  )                                          as purchase_share,
  coalesce(w.parts_cost, 0)                  as parts_cost,
  coalesce(w.extras_cost, 0)                 as extras_cost,
  coalesce(tf.sourced_cost, 0)               as to_find_cost,
  coalesce(
    i.allocated_cost,
    round(pa.unallocated_cost / nullif(pa.item_count - pa.allocated_item_count, 0), 2),
    0
  ) + coalesce(w.parts_cost, 0) + coalesce(w.extras_cost, 0) + coalesce(tf.sourced_cost, 0)
                                             as total_cost,
  coalesce(w.labour_minutes, 0)              as labour_minutes,
  round(coalesce(w.labour_minutes, 0) / 60.0, 2) as labour_hours,
  round(coalesce(w.labour_minutes, 0) / 60.0 * st.labour_rate, 2) as labour_cost,
  coalesce(w.work_charge, 0)                 as work_charge,
  coalesce(tf.open_count, 0)                 as open_to_find_count,
  i.expected_price,
  lp.listed_price,
  coalesce(lp.listed_price, i.expected_price) as sale_value,
  coalesce(lp.listed_price, i.expected_price) - (
    coalesce(
      i.allocated_cost,
      round(pa.unallocated_cost / nullif(pa.item_count - pa.allocated_item_count, 0), 2),
      0
    ) + coalesce(w.parts_cost, 0) + coalesce(w.extras_cost, 0) + coalesce(tf.sourced_cost, 0)
  )                                          as potential_profit
from public.items i
left join public.purchases pu on pu.id = i.purchase_id
left join public.purchase_allocations pa on pa.purchase_id = i.purchase_id
left join public.settings st on st.owner_id = i.owner_id
left join lateral (
  select
    sum(wl.extra_cost)                  as extras_cost,
    sum(wl.minutes_each * wl.qty)       as labour_minutes,
    sum(wl.price_each * wl.qty)         as work_charge,
    sum((
      select coalesce(sum(round(wlp.qty * wlp.unit_cost, 2)), 0)
      from public.work_line_parts wlp
      where wlp.work_line_id = wl.id and not wlp.customer_supplied
    ))                                  as parts_cost
  from public.work_lines wl
  where wl.item_id = i.id
) w on true
left join lateral (
  select
    sum(n.cost) filter (where n.status = 'sourced') as sourced_cost,
    count(*) filter (where n.status = 'open')       as open_count
  from public.to_find_notes n
  where n.item_id = i.id
) tf on true
left join lateral (
  select min(l.asking_price) as listed_price
  from public.listing_items li
  join public.listings l on l.id = li.listing_id
  where li.item_id = i.id
    and l.status = 'live'
    and (select count(*) from public.listing_items x where x.listing_id = l.id) = 1
) lp on true;

-- dashboard_summary gains stock at sale value. stock_value stays the cost of unsold
-- stock (what is invested); new columns are appended.
create or replace view public.dashboard_summary
with (security_invoker = true)
as
select
  (select coalesce(sum(ic.total_cost), 0) from public.item_costs ic
    where ic.status in ('in_stock', 'in_work', 'ready', 'listed') and ic.customer_id is null) as stock_value,
  (select count(*) from public.item_costs ic
    where ic.status in ('in_stock', 'in_work', 'ready', 'listed') and ic.customer_id is null) as stock_count,

  (select coalesce(sum(sp.profit), 0) from public.sale_profits sp
    where sp.sold_on >= date_trunc('month', current_date)) as month_profit,
  (select count(*) from public.sale_profits sp
    where sp.sold_on >= date_trunc('month', current_date)) as month_sales,
  (select coalesce(sum(o.amount), 0) from public.overheads o
    where o.spent_on >= date_trunc('month', current_date)) as month_overheads,

  (select coalesce(sum(sp.profit), 0) from public.sale_profits sp
    where sp.sold_on >= date_trunc('year', current_date)) as ytd_profit,
  (select count(*) from public.sale_profits sp
    where sp.sold_on >= date_trunc('year', current_date)) as ytd_sales,
  (select count(*) from public.sale_profits sp
    where sp.sold_on >= date_trunc('year', current_date) and sp.profit < 0) as ytd_losses,
  (select coalesce(sum(o.amount), 0) from public.overheads o
    where o.spent_on >= date_trunc('year', current_date)) as ytd_overheads,

  (select round(avg(sp.days_to_sell)) from public.sale_profits sp
    where sp.sold_on >= current_date - 90 and sp.days_to_sell is not null) as avg_days_to_sell,
  (select count(*) from public.sale_profits sp
    where sp.sold_on >= current_date - 90 and sp.days_to_sell is not null) as recent_sales_timed,

  -- Unsold stock at its sale value, and the cost of just those priced items, so
  -- potential profit compares like with like. Unpriced items are counted separately.
  (select coalesce(sum(ic.sale_value), 0) from public.item_costs ic
    where ic.status in ('in_stock', 'in_work', 'ready', 'listed') and ic.customer_id is null
      and ic.sale_value is not null) as stock_sale_value,
  (select coalesce(sum(ic.total_cost), 0) from public.item_costs ic
    where ic.status in ('in_stock', 'in_work', 'ready', 'listed') and ic.customer_id is null
      and ic.sale_value is not null) as stock_priced_cost,
  (select count(*) from public.item_costs ic
    where ic.status in ('in_stock', 'in_work', 'ready', 'listed') and ic.customer_id is null
      and ic.sale_value is null) as stock_unpriced_count;

-- ---------------------------------------------------------------------------
-- log_purchase: accepts source_id (or source text, via the trigger) and each
-- item's expected_price. Same signature, so existing callers keep working.
-- ---------------------------------------------------------------------------

create or replace function public.log_purchase(p_purchase jsonb, p_items jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_purchase_id uuid;
begin
  if p_items is null or pg_catalog.jsonb_typeof(p_items) <> 'array' or pg_catalog.jsonb_array_length(p_items) = 0 then
    raise exception 'A purchase needs at least one item' using errcode = 'check_violation';
  end if;

  insert into public.purchases (purchased_on, source_id, source, price, postage_in, notes)
  values (
    coalesce((p_purchase ->> 'purchased_on')::date, current_date),
    (p_purchase ->> 'source_id')::uuid,
    nullif(pg_catalog.btrim(p_purchase ->> 'source'), ''),
    coalesce((p_purchase ->> 'price')::numeric, 0),
    coalesce((p_purchase ->> 'postage_in')::numeric, 0),
    nullif(pg_catalog.btrim(p_purchase ->> 'notes'), '')
  )
  returning id into v_purchase_id;

  insert into public.items (purchase_id, name, category_id, contents, condition, field_values, allocated_cost, expected_price)
  select
    v_purchase_id,
    pg_catalog.btrim(x.name),
    x.category_id,
    nullif(pg_catalog.btrim(x.contents), ''),
    nullif(pg_catalog.btrim(x.condition), ''),
    coalesce(x.field_values, '{}'::jsonb),
    x.allocated_cost,
    x.expected_price
  from pg_catalog.jsonb_to_recordset(p_items) as x(
    name text,
    category_id uuid,
    contents text,
    condition text,
    field_values jsonb,
    allocated_cost numeric,
    expected_price numeric
  );

  return v_purchase_id;
end;
$$;
