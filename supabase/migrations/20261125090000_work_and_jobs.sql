-- Workshop Manager: save work lines and jobs in one transaction.
--
-- Both run as the caller (RLS applies) and lean on the existing triggers:
-- work-line defaults from the service, part-cost snapshots and stock movement.

-- ---------------------------------------------------------------------------
-- add_work_line: a work line and the parts used on it
-- ---------------------------------------------------------------------------
-- p_line:  { item_id, service_id, qty, job_id?, minutes_each?, price_each?,
--            extra_cost?, notes?, done_on? }   (null minutes/price = service default)
-- p_parts: [ { part_id?, qty, unit_cost?, customer_supplied?, description? } ]
--          (null unit_cost = the part's current cost)
-- Moves the item from In stock to In work.

create function public.add_work_line(p_line jsonb, p_parts jsonb default '[]'::jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_item uuid := (p_line ->> 'item_id')::uuid;
begin
  insert into public.work_lines (item_id, job_id, service_id, qty, minutes_each, price_each, extra_cost, notes, done_on)
  values (
    v_item,
    (p_line ->> 'job_id')::uuid,
    (p_line ->> 'service_id')::uuid,
    coalesce((p_line ->> 'qty')::integer, 1),
    (p_line ->> 'minutes_each')::integer,
    (p_line ->> 'price_each')::numeric,
    coalesce((p_line ->> 'extra_cost')::numeric, 0),
    nullif(pg_catalog.btrim(p_line ->> 'notes'), ''),
    (p_line ->> 'done_on')::date
  )
  returning id into v_id;

  insert into public.work_line_parts (work_line_id, part_id, description, qty, unit_cost, customer_supplied)
  select
    v_id,
    x.part_id,
    nullif(pg_catalog.btrim(x.description), ''),
    x.qty,
    x.unit_cost,
    coalesce(x.customer_supplied, false)
  from pg_catalog.jsonb_to_recordset(coalesce(p_parts, '[]'::jsonb)) as x(
    part_id uuid,
    description text,
    qty integer,
    unit_cost numeric,
    customer_supplied boolean
  );

  update public.items set status = 'in_work' where id = v_item and status = 'in_stock';

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- create_job: a job and the items it covers
-- ---------------------------------------------------------------------------
-- p_job: { kind, title?, status?, target_price?, notes? }

create function public.create_job(p_job jsonb, p_item_ids uuid[] default '{}')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.jobs (kind, status, title, target_price, notes)
  values (
    p_job ->> 'kind',
    coalesce(p_job ->> 'status', 'open'),
    nullif(pg_catalog.btrim(p_job ->> 'title'), ''),
    (p_job ->> 'target_price')::numeric,
    nullif(pg_catalog.btrim(p_job ->> 'notes'), '')
  )
  returning id into v_id;

  insert into public.job_items (job_id, item_id)
  select v_id, x from pg_catalog.unnest(coalesce(p_item_ids, '{}')) as x
  on conflict do nothing;

  return v_id;
end;
$$;

revoke execute on function
  public.add_work_line(jsonb, jsonb),
  public.create_job(jsonb, uuid[])
from public, anon;

grant execute on function
  public.add_work_line(jsonb, jsonb),
  public.create_job(jsonb, uuid[])
to authenticated;
