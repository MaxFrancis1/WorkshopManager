-- Workshop Manager: money in vs money out.
--
-- Profit on a sale (sale − that item's cost) only moves when something sells. This
-- adds the cash view: everything spent and everything received, by date, so buying
-- stock with no sales yet shows as money out.
--
--   money out: purchases (price + postage in), parts restocks, overheads, extra costs
--              on work lines, sourced to-find parts
--   money in:  sales, after fees and postage out
--
-- Parts stock entered when a part is first created has no purchase date, so only
-- logged restocks count as spending on parts.

create view public.money_flows
with (security_invoker = true)
as
select p.owner_id, p.purchased_on as flow_date, 'purchase'::text as kind,
       0::numeric as money_in, p.price + p.postage_in as money_out
from public.purchases p
union all
select r.owner_id, r.restocked_on, 'parts', 0, round(r.qty * r.unit_cost, 2)
from public.part_restocks r
union all
select o.owner_id, o.spent_on, 'overhead', 0, o.amount
from public.overheads o
union all
select w.owner_id, coalesce(w.done_on, w.created_at::date), 'extras', 0, w.extra_cost
from public.work_lines w
where w.extra_cost > 0
union all
select n.owner_id, coalesce(n.sourced_on, n.created_at::date), 'sourced', 0, n.cost
from public.to_find_notes n
where n.status = 'sourced' and n.cost > 0
union all
select s.owner_id, s.sold_on, 'sale', s.sale_price - s.fees - s.postage_out, 0
from public.sales s;

-- The last 12 months, including empty ones, with money out broken down.
create view public.monthly_net
with (security_invoker = true)
as
with months as (
  select pg_catalog.generate_series(
    date_trunc('month', current_date) - interval '11 months',
    date_trunc('month', current_date),
    interval '1 month'
  )::date as month
),
f as (
  select
    date_trunc('month', mf.flow_date)::date                         as month,
    sum(mf.money_in)                                                as money_in,
    sum(mf.money_out)                                               as money_out,
    sum(mf.money_out) filter (where mf.kind = 'purchase')           as purchases_out,
    sum(mf.money_out) filter (where mf.kind = 'parts')              as parts_out,
    sum(mf.money_out) filter (where mf.kind = 'overhead')           as overheads_out,
    sum(mf.money_out) filter (where mf.kind in ('extras', 'sourced')) as work_out
  from public.money_flows mf
  group by 1
)
select
  m.month,
  coalesce(f.money_in, 0)                               as money_in,
  coalesce(f.money_out, 0)                              as money_out,
  coalesce(f.money_in, 0) - coalesce(f.money_out, 0)    as net,
  coalesce(f.purchases_out, 0)                          as purchases_out,
  coalesce(f.parts_out, 0)                              as parts_out,
  coalesce(f.overheads_out, 0)                          as overheads_out,
  coalesce(f.work_out, 0)                               as work_out
from months m
left join f on f.month = m.month;

-- dashboard_summary gains money in and out for this month, the year and all time.
-- Existing columns are unchanged; new ones are appended.
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

  (select coalesce(sum(ic.sale_value), 0) from public.item_costs ic
    where ic.status in ('in_stock', 'in_work', 'ready', 'listed') and ic.customer_id is null
      and ic.sale_value is not null) as stock_sale_value,
  (select coalesce(sum(ic.total_cost), 0) from public.item_costs ic
    where ic.status in ('in_stock', 'in_work', 'ready', 'listed') and ic.customer_id is null
      and ic.sale_value is not null) as stock_priced_cost,
  (select count(*) from public.item_costs ic
    where ic.status in ('in_stock', 'in_work', 'ready', 'listed') and ic.customer_id is null
      and ic.sale_value is null) as stock_unpriced_count,

  (select coalesce(sum(mf.money_in), 0) from public.money_flows mf
    where mf.flow_date >= date_trunc('month', current_date)) as month_money_in,
  (select coalesce(sum(mf.money_out), 0) from public.money_flows mf
    where mf.flow_date >= date_trunc('month', current_date)) as month_money_out,
  (select coalesce(sum(mf.money_in), 0) from public.money_flows mf
    where mf.flow_date >= date_trunc('year', current_date)) as ytd_money_in,
  (select coalesce(sum(mf.money_out), 0) from public.money_flows mf
    where mf.flow_date >= date_trunc('year', current_date)) as ytd_money_out,
  (select coalesce(sum(mf.money_in), 0) from public.money_flows mf) as total_money_in,
  (select coalesce(sum(mf.money_out), 0) from public.money_flows mf) as total_money_out;

revoke all on public.money_flows, public.monthly_net from anon, public;
grant select on public.money_flows, public.monthly_net to authenticated;
