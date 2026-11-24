-- Workshop Manager: finish moving purchases to configured sources.
--
-- The app now reads and writes purchases.source_id only, so the transitional
-- free-text column and the trigger that kept it in step can go.

drop trigger purchases_sync_source on public.purchases;
drop function public.purchases_sync_source();

-- Same columns as before; source now comes only from the sources table.
create or replace view public.purchase_allocations
with (security_invoker = true)
as
select
  p.id                                                     as purchase_id,
  p.owner_id,
  p.purchased_on,
  (select s.name from public.sources s where s.id = p.source_id) as source,
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

  insert into public.purchases (purchased_on, source_id, price, postage_in, notes)
  values (
    coalesce((p_purchase ->> 'purchased_on')::date, current_date),
    (p_purchase ->> 'source_id')::uuid,
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

alter table public.purchases drop column source;
