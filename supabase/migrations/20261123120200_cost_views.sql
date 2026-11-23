-- Workshop Manager: cost roll-up views.
--
-- All views are security_invoker, so the caller's RLS applies to every table
-- they read. Profit = sale − fees − postage out − (purchase share + parts +
-- extras + sourced to-find costs); labour is costed only when a labour rate is set.

-- ---------------------------------------------------------------------------
-- Purchase allocation: how much of each purchase is pinned to items
-- ---------------------------------------------------------------------------

create view public.purchase_allocations
with (security_invoker = true)
as
select
  p.id                                                     as purchase_id,
  p.owner_id,
  p.purchased_on,
  p.source,
  p.price + p.postage_in                                   as total_cost,
  count(i.id)                                              as item_count,
  count(i.id) filter (where i.allocated_cost is not null)  as allocated_item_count,
  coalesce(sum(i.allocated_cost), 0)                       as allocated_cost,
  p.price + p.postage_in - coalesce(sum(i.allocated_cost), 0) as unallocated_cost,
  coalesce(sum(i.allocated_cost), 0) > p.price + p.postage_in  as over_allocated
from public.purchases p
left join public.items i on i.purchase_id = p.id
group by p.id;

-- ---------------------------------------------------------------------------
-- Item costs
-- ---------------------------------------------------------------------------

create view public.item_costs
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
  -- Explicit allocation, else an equal share of what the purchase has left.
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
  -- Null when no labour rate is set: "~4 h labour required".
  round(coalesce(w.labour_minutes, 0) / 60.0 * st.labour_rate, 2) as labour_cost,
  coalesce(w.work_charge, 0)                 as work_charge,
  coalesce(tf.open_count, 0)                 as open_to_find_count
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
) tf on true;

-- ---------------------------------------------------------------------------
-- Sale profits (actuals)
-- ---------------------------------------------------------------------------

create view public.sale_profits
with (security_invoker = true)
as
select
  s.id                                         as sale_id,
  s.owner_id,
  s.sold_on,
  s.channel_id,
  s.listing_id,
  s.sale_price,
  s.fees,
  s.postage_out,
  count(ic.item_id)                            as item_count,
  coalesce(sum(ic.total_cost), 0)              as items_cost,
  coalesce(sum(ic.labour_minutes), 0)          as labour_minutes,
  s.sale_price - s.fees - s.postage_out - coalesce(sum(ic.total_cost), 0) as profit,
  round(
    (s.sale_price - s.fees - s.postage_out - coalesce(sum(ic.total_cost), 0))
      / nullif(s.sale_price, 0) * 100, 1)      as margin_percent,
  round(coalesce(sum(ic.labour_minutes), 0) / 60.0 * st.labour_rate, 2) as labour_cost,
  s.sale_price - s.fees - s.postage_out - coalesce(sum(ic.total_cost), 0)
    - round(coalesce(sum(ic.labour_minutes), 0) / 60.0 * st.labour_rate, 2) as profit_after_labour,
  -- Earliest purchase among the sold items, for days-to-sell.
  min(ic.purchased_on)                         as first_purchased_on,
  s.sold_on - min(ic.purchased_on)             as days_to_sell
from public.sales s
left join public.sale_items si on si.sale_id = s.id
left join public.item_costs ic on ic.item_id = si.item_id
left join public.settings st on st.owner_id = s.owner_id
group by s.id, st.owner_id;

-- ---------------------------------------------------------------------------
-- Job totals (estimates on the job; customer service jobs charge work_charge)
-- ---------------------------------------------------------------------------

create view public.job_totals
with (security_invoker = true)
as
select
  j.id                                   as job_id,
  j.owner_id,
  j.kind,
  j.status,
  j.customer_id,
  j.target_price,
  coalesce(ji.item_count, 0)             as item_count,
  coalesce(w.labour_minutes, 0)          as labour_minutes,
  round(coalesce(w.labour_minutes, 0) / 60.0, 2) as labour_hours,
  round(coalesce(w.labour_minutes, 0) / 60.0 * st.labour_rate, 2) as labour_cost,
  coalesce(w.parts_cost, 0)              as parts_cost,
  coalesce(w.extras_cost, 0)             as extras_cost,
  coalesce(w.work_charge, 0)             as work_charge,
  coalesce(w.work_charge, 0) - coalesce(w.parts_cost, 0) - coalesce(w.extras_cost, 0) as service_profit
from public.jobs j
left join public.settings st on st.owner_id = j.owner_id
left join lateral (
  select count(*) as item_count from public.job_items x where x.job_id = j.id
) ji on true
left join lateral (
  select
    sum(wl.minutes_each * wl.qty)       as labour_minutes,
    sum(wl.extra_cost)                  as extras_cost,
    sum(wl.price_each * wl.qty)         as work_charge,
    sum((
      select coalesce(sum(round(wlp.qty * wlp.unit_cost, 2)), 0)
      from public.work_line_parts wlp
      where wlp.work_line_id = wl.id and not wlp.customer_supplied
    ))                                  as parts_cost
  from public.work_lines wl
  where wl.job_id = j.id
) w on true;

-- ---------------------------------------------------------------------------
-- Parts with low-stock flag
-- ---------------------------------------------------------------------------

create view public.part_stock
with (security_invoker = true)
as
select
  p.id            as part_id,
  p.owner_id,
  p.name,
  p.part_type_id,
  pt.name         as part_type_name,
  p.unit_cost,
  p.qty_on_hand,
  p.reorder_level,
  -- "Reorder at 6": flagged once stock is down to the reorder level.
  p.reorder_level > 0 and p.qty_on_hand <= p.reorder_level as low_stock
from public.parts p
join public.part_types pt on pt.id = p.part_type_id;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on
  public.purchase_allocations, public.item_costs, public.sale_profits,
  public.job_totals, public.part_stock
from anon, public;

grant select on
  public.purchase_allocations, public.item_costs, public.sale_profits,
  public.job_totals, public.part_stock
to authenticated;
