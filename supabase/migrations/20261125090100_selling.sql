-- Workshop Manager: listings and sales in one transaction, keeping item and
-- listing statuses in step.
--
-- Item status: posting a listing moves In stock / In work / Ready to Listed;
-- withdrawing the last live listing moves Listed back to Ready; a sale marks
-- items Sold and closes their live listings (Sold on the channel it sold on,
-- Withdrawn elsewhere). Listing age is kept: price changes are plain updates
-- that leave posted_on alone.

-- ---------------------------------------------------------------------------
-- create_listing
-- ---------------------------------------------------------------------------
-- p_listing: { channel_id, asking_price?, title?, posted_on?, notes? }
-- p_item_ids: one item, or several for a lot.

create function public.create_listing(p_listing jsonb, p_item_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_item_ids is null or pg_catalog.cardinality(p_item_ids) = 0 then
    raise exception 'A listing needs at least one item' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.items where id = any (p_item_ids) and status in ('sold', 'written_off')) then
    raise exception 'Sold or written-off items cannot be listed' using errcode = 'check_violation';
  end if;

  insert into public.listings (channel_id, asking_price, title, posted_on, notes)
  values (
    (p_listing ->> 'channel_id')::uuid,
    (p_listing ->> 'asking_price')::numeric,
    nullif(pg_catalog.btrim(p_listing ->> 'title'), ''),
    coalesce((p_listing ->> 'posted_on')::date, current_date),
    nullif(pg_catalog.btrim(p_listing ->> 'notes'), '')
  )
  returning id into v_id;

  insert into public.listing_items (listing_id, item_id)
  select v_id, x from pg_catalog.unnest(p_item_ids) as x
  on conflict do nothing;

  update public.items
  set status = 'listed'
  where id = any (p_item_ids) and status in ('in_stock', 'in_work', 'ready');

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- withdraw_listing
-- ---------------------------------------------------------------------------

create function public.withdraw_listing(p_listing_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.listings
  set status = 'withdrawn', ended_on = current_date
  where id = p_listing_id and status = 'live';

  -- Items with no other live listing go back to Ready.
  update public.items i
  set status = 'ready'
  where i.status = 'listed'
    and i.id in (select li.item_id from public.listing_items li where li.listing_id = p_listing_id)
    and not exists (
      select 1
      from public.listing_items li2
      join public.listings l2 on l2.id = li2.listing_id
      where li2.item_id = i.id and l2.status = 'live'
    );
end;
$$;

-- ---------------------------------------------------------------------------
-- record_sale
-- ---------------------------------------------------------------------------
-- p_sale: { sale_price, sold_on?, channel_id?, listing_id?, fees?, postage_out?, notes? }
-- When listing_id is not given, the live listing on the sale's channel that
-- holds these items is linked, so channel sell-through counts it.

create function public.record_sale(p_sale jsonb, p_item_ids uuid[])
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_channel uuid := (p_sale ->> 'channel_id')::uuid;
  v_listing uuid := (p_sale ->> 'listing_id')::uuid;
  v_sold_on date := coalesce((p_sale ->> 'sold_on')::date, current_date);
begin
  if p_item_ids is null or pg_catalog.cardinality(p_item_ids) = 0 then
    raise exception 'A sale needs at least one item' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.items where id = any (p_item_ids) and status in ('sold', 'written_off')) then
    raise exception 'An item in this sale is already sold or written off' using errcode = 'check_violation';
  end if;

  if v_listing is null and v_channel is not null then
    select l.id into v_listing
    from public.listings l
    join public.listing_items li on li.listing_id = l.id
    where l.status = 'live' and l.channel_id = v_channel and li.item_id = any (p_item_ids)
    order by l.posted_on
    limit 1;
  end if;

  insert into public.sales (sold_on, channel_id, listing_id, sale_price, fees, postage_out, notes)
  values (
    v_sold_on,
    v_channel,
    v_listing,
    (p_sale ->> 'sale_price')::numeric,
    coalesce((p_sale ->> 'fees')::numeric, 0),
    coalesce((p_sale ->> 'postage_out')::numeric, 0),
    nullif(pg_catalog.btrim(p_sale ->> 'notes'), '')
  )
  returning id into v_id;

  insert into public.sale_items (sale_id, item_id)
  select v_id, x from pg_catalog.unnest(p_item_ids) as x
  on conflict do nothing;

  update public.items set status = 'sold' where id = any (p_item_ids);

  update public.listings l
  set status = case when l.id = v_listing then 'sold' else 'withdrawn' end,
      ended_on = v_sold_on
  where l.status = 'live'
    and exists (
      select 1 from public.listing_items li
      where li.listing_id = l.id and li.item_id = any (p_item_ids)
    );

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- delete_sale: undo a sale entered by mistake
-- ---------------------------------------------------------------------------
-- (Returns and refunds, which keep the lost fees as a cost, come later.)
-- Reopens the listing it sold through; items go back to Listed if a live
-- listing holds them, otherwise Ready.

create function public.delete_sale(p_sale_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_listing uuid;
  v_items uuid[];
begin
  select s.listing_id into v_listing from public.sales s where s.id = p_sale_id;
  select pg_catalog.array_agg(si.item_id) into v_items from public.sale_items si where si.sale_id = p_sale_id;

  delete from public.sales where id = p_sale_id;

  if v_listing is not null then
    update public.listings set status = 'live', ended_on = null where id = v_listing and status = 'sold';
  end if;

  update public.items i
  set status = case
        when exists (
          select 1 from public.listing_items li
          join public.listings l on l.id = li.listing_id
          where li.item_id = i.id and l.status = 'live'
        ) then 'listed'
        else 'ready'
      end
  where i.id = any (coalesce(v_items, '{}')) and i.status = 'sold';
end;
$$;

revoke execute on function
  public.create_listing(jsonb, uuid[]),
  public.withdraw_listing(uuid),
  public.record_sale(jsonb, uuid[]),
  public.delete_sale(uuid)
from public, anon;

grant execute on function
  public.create_listing(jsonb, uuid[]),
  public.withdraw_listing(uuid),
  public.record_sale(jsonb, uuid[]),
  public.delete_sale(uuid)
to authenticated;
