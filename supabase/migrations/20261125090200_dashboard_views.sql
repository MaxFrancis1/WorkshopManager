-- Workshop Manager: dashboard views.
--
-- Built from actual sales (sale_profits), never from calculator estimates.
-- All security_invoker. "Recent" windows are the last 90 days, matching the
-- dashboard designs. Profit comes from sales only; customer service jobs are
-- not counted yet.

-- ---------------------------------------------------------------------------
-- Headline figures: one row for the signed-in user
-- ---------------------------------------------------------------------------

create view public.dashboard_summary
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
    where sp.sold_on >= current_date - 90 and sp.days_to_sell is not null) as recent_sales_timed;

-- ---------------------------------------------------------------------------
-- Profit by month: the last 12 months, including months with no sales
-- ---------------------------------------------------------------------------

create view public.monthly_profit
with (security_invoker = true)
as
with months as (
  select pg_catalog.generate_series(
    date_trunc('month', current_date) - interval '11 months',
    date_trunc('month', current_date),
    interval '1 month'
  )::date as month
),
s as (
  select date_trunc('month', sp.sold_on)::date as month,
         count(*) as sales_count,
         sum(sp.sale_price) as revenue,
         sum(sp.profit) as profit,
         count(*) filter (where sp.profit < 0) as loss_count
  from public.sale_profits sp
  group by 1
),
o as (
  select date_trunc('month', ov.spent_on)::date as month, sum(ov.amount) as overheads
  from public.overheads ov
  group by 1
)
select
  m.month,
  coalesce(s.sales_count, 0)                            as sales_count,
  coalesce(s.revenue, 0)                                as revenue,
  coalesce(s.profit, 0)                                 as profit,
  coalesce(s.loss_count, 0)                             as loss_count,
  coalesce(o.overheads, 0)                              as overheads,
  coalesce(s.profit, 0) - coalesce(o.overheads, 0)      as profit_after_overheads
from months m
left join s on s.month = m.month
left join o on o.month = m.month;

-- ---------------------------------------------------------------------------
-- Channels: posted vs sold over the last 90 days
-- ---------------------------------------------------------------------------

create view public.channel_stats
with (security_invoker = true)
as
select
  ch.id          as channel_id,
  ch.owner_id,
  ch.name,
  ch.fee_percent,
  ch.fixed_fee,
  coalesce(lp.posted, 0)  as posted,
  coalesce(sd.sold, 0)    as sold,
  round(coalesce(sd.sold, 0) * 100.0 / nullif(lp.posted, 0)) as sell_through_percent,
  sd.avg_days_to_sell,
  coalesce(lv.live, 0)    as live_listings
from public.channels ch
left join lateral (
  select count(*) as posted from public.listings l
  where l.channel_id = ch.id and l.posted_on >= current_date - 90
) lp on true
left join lateral (
  select count(*) as sold, round(avg(sp.days_to_sell)) as avg_days_to_sell
  from public.sale_profits sp
  where sp.channel_id = ch.id and sp.sold_on >= current_date - 90
) sd on true
left join lateral (
  select count(*) as live from public.listings l where l.channel_id = ch.id and l.status = 'live'
) lv on true;

-- ---------------------------------------------------------------------------
-- Average days to sell by category, last 90 days
-- ---------------------------------------------------------------------------

create view public.category_sell_times
with (security_invoker = true)
as
select
  c.id                         as category_id,
  c.owner_id,
  c.name,
  count(*)                     as sales_count,
  round(avg(x.days_to_sell))   as avg_days_to_sell
from (
  -- One row per sale and category, so a lot of five irons counts once.
  select distinct sp.sale_id, i.category_id, sp.days_to_sell
  from public.sale_profits sp
  join public.sale_items si on si.sale_id = sp.sale_id
  join public.items i on i.id = si.item_id
  where sp.sold_on >= current_date - 90 and sp.days_to_sell is not null and i.category_id is not null
) x
join public.categories c on c.id = x.category_id
group by c.id;

-- ---------------------------------------------------------------------------
-- Aged stock: unsold items older than the aged-stock setting (default 90 days)
-- ---------------------------------------------------------------------------

create view public.aged_stock
with (security_invoker = true)
as
select
  ic.item_id,
  ic.owner_id,
  ic.short_id,
  ic.name,
  ic.status,
  ic.purchased_on,
  current_date - ic.purchased_on  as days_in_stock,
  ic.total_cost
from public.item_costs ic
left join public.settings st on st.owner_id = ic.owner_id
where ic.status in ('in_stock', 'in_work', 'ready', 'listed')
  and ic.customer_id is null
  and ic.purchased_on is not null
  and current_date - ic.purchased_on > coalesce(st.aged_stock_days, 90);

-- ---------------------------------------------------------------------------
-- Open to-find notes, flagged when the item is already Ready or Listed
-- ---------------------------------------------------------------------------

create view public.open_to_find
with (security_invoker = true)
as
select
  n.id           as note_id,
  n.owner_id,
  n.description,
  n.created_at,
  i.id           as item_id,
  i.short_id,
  i.name         as item_name,
  i.status       as item_status,
  i.status in ('ready', 'listed') as flagged
from public.to_find_notes n
join public.items i on i.id = n.item_id
where n.status = 'open';

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

revoke all on
  public.dashboard_summary, public.monthly_profit, public.channel_stats,
  public.category_sell_times, public.aged_stock, public.open_to_find
from anon, public;

grant select on
  public.dashboard_summary, public.monthly_profit, public.channel_stats,
  public.category_sell_times, public.aged_stock, public.open_to_find
to authenticated;
