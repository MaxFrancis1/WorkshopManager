-- Workshop Manager: log a purchase and its items in one transaction.
--
-- Called from the app as rpc('log_purchase', { p_purchase, p_items }). Runs as the
-- caller, so RLS and the items short-ID trigger apply as for direct inserts.

create function public.log_purchase(p_purchase jsonb, p_items jsonb)
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

  insert into public.purchases (purchased_on, source, price, postage_in, notes)
  values (
    coalesce((p_purchase ->> 'purchased_on')::date, current_date),
    nullif(pg_catalog.btrim(p_purchase ->> 'source'), ''),
    coalesce((p_purchase ->> 'price')::numeric, 0),
    coalesce((p_purchase ->> 'postage_in')::numeric, 0),
    nullif(pg_catalog.btrim(p_purchase ->> 'notes'), '')
  )
  returning id into v_purchase_id;

  insert into public.items (purchase_id, name, category_id, contents, condition, field_values, allocated_cost)
  select
    v_purchase_id,
    pg_catalog.btrim(x.name),
    x.category_id,
    nullif(pg_catalog.btrim(x.contents), ''),
    nullif(pg_catalog.btrim(x.condition), ''),
    coalesce(x.field_values, '{}'::jsonb),
    x.allocated_cost
  from pg_catalog.jsonb_to_recordset(p_items) as x(
    name text,
    category_id uuid,
    contents text,
    condition text,
    field_values jsonb,
    allocated_cost numeric
  );

  return v_purchase_id;
end;
$$;

revoke execute on function public.log_purchase(jsonb, jsonb) from public, anon;
grant execute on function public.log_purchase(jsonb, jsonb) to authenticated;
